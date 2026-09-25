import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { generateSpeech, TTS_TIMEOUT_MS } from "@/lib/server/tts";
import { MAX_SCRIPT_WORDS, MAX_DIRECTION, countWords, validateRequest } from "@/lib/contracts";
import { buildEffectiveDirection, getVoiceVariant, TRANSCRIPT_FIDELITY_INSTRUCTION, VOICE_VARIANTS } from "@/lib/voice-profiles";
import { isValidWav, pcmToWav, MAX_PCM_BYTES } from "@/lib/audio";

const input = { text: "  నమస్కారం! Welcome.\n", direction: "Warm, medium pace.", variantId: "firm-female" as const };
const pcm = Buffer.from([0, 0, 255, 127, 0, 128, 1, 0]);
function providerResponse(data = pcm.toString("base64"), mime = "audio/l16") {
  return Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data, mime_type: mime }] }] });
}
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-key-not-real"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("request validation and endpoint", () => {
  it.each(["", "server-secret"])("uses a request-scoped key with or without a server key (%s)", async (serverKey) => {
    vi.stubEnv("GEMINI_API_KEY", serverKey);
    const personalKey = "personal-key.with-punctuation";
    const fetchMock = vi.fn().mockResolvedValue(providerResponse()); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(input, { Authorization: `Bearer ${personalKey}` }));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe(personalKey);
    expect(fetchMock.mock.calls[0][1].body).not.toContain(personalKey);
    expect(process.env.GEMINI_API_KEY).toBe(serverKey);
    expect(JSON.stringify([...response.headers])).not.toContain(personalKey);
  });
  it("isolates simultaneous callers' keys and retains the server fallback", async () => {
    const keys: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { keys.push(init.headers["x-goog-api-key"]); return providerResponse(); }));
    const responses = await Promise.all([
      POST(request(input, { Authorization: "Bearer caller-one" })),
      POST(request(input, { Authorization: "Bearer caller-two" })),
      POST(request()),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(keys.sort()).toEqual(["caller-one", "caller-two", "test-key-not-real"]);
  });
  it.each([401, 403, 429])("never falls back or leaks a supplied key after provider %s", async (status) => {
    const key = "personal-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(`private failure with ${key}`, { status })); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(input, { Authorization: `Bearer ${key}` }));
    expect((await response.text())).not.toContain(key);
    expect(response.status).toBe(status === 429 ? 429 : 401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(key);
  });
  it.each(["Basic private-key", "Bearer", `Bearer ${"x".repeat(8193)}`])("rejects an unusable authorization header before fetching", async (authorization) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(input, { Authorization: authorization }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves script and direction exactly and defaults optional fields", () => {
    expect(validateRequest(input)).toEqual(input);
    expect(validateRequest({ text: "Hello" })).toEqual({ text: "Hello", direction: "", variantId: "warm-female" });
  });
  it.each([
    ["empty", { ...input, text: " \n " }],
    ["missing", { direction: "" }],
    ["oversized", { ...input, text: "word ".repeat(MAX_SCRIPT_WORDS + 1) }],
    ["oversized section", { ...input, text: "a".repeat(801) }],
    ["invalid voice", { ...input, variantId: "unknown" }],
    ["oversized direction", { ...input, direction: "a".repeat(MAX_DIRECTION + 1) }],
    ["non-string direction", { ...input, direction: 12 }],
    ["array", []], ["null", null],
  ])("rejects %s before contacting Gemini", async (_label, body) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(body));
    expect(response.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toEqual(expect.any(String));
  });
  it("accepts 3,000 words including Telugu, but rejects 3,001", () => {
    const text = "నమస్కారం ప్రపంచం!\n".repeat(1500);
    expect(countWords(text)).toBe(3000);
    expect(validateRequest({ ...input, text }).text).toBe(text);
    expect(() => validateRequest({ ...input, text: text + "extra" })).toThrow("3,000 words");
    expect(countWords(" \n\t ")).toBe(0);
  });
  it("rejects malformed JSON, unsupported content type, oversized body, and foreign origins", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const malformed = new Request("http://localhost/api/generate", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(request(input, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({ text: "x".repeat(17000) }))).status).toBe(413);
    expect((await POST(request(input, { Origin: "https://elsewhere.example" }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns playable binary WAV and separates delivery from verbatim speech", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse()); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("content-disposition")).toContain('filename="voiceover.wav"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(isValidWav(bytes)).toBe(true);
    expect([...bytes.subarray(44)]).toEqual([...pcm]);
    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.input[0].content[0].text).toBe(input.text);
    expect(body.input[0].content[0].annotations[0].style).toBe(buildEffectiveDirection(getVoiceVariant(input.variantId)!.profile, input.direction));
    expect(body.generation_config.speech_config[0].voice).toBe(getVoiceVariant(input.variantId)!.voice);
    expect(body.response_format).toEqual({ type: "audio", mime_type: "audio/l16", sample_rate: 24000 });
    expect(body.store).toBe(false);
    expect(init.headers["x-goog-api-key"]).toBe("test-key-not-real");
  });
  it("accepts the browser origin when Next normalizes the internal request hostname", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse()));
    const response = await POST(request(input, { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" }));
    expect(response.status).toBe(200);
    expect((await POST(request(input, { Host: "127.0.0.1:3000", Origin: "null" }))).status).toBe(403);
  });
  it.each([[429, 429, "RATE_LIMITED"], [500, 503, "PROVIDER_UNAVAILABLE"], [403, 503, "PROVIDER_UNAVAILABLE"], [504, 504, "TIMEOUT"]])("maps provider %s to safe errors", async (upstream, status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret provider internals", { status: upstream })));
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body = await response.text(); expect(body).toContain(code);
    expect(body).not.toContain("secret"); expect(body).not.toContain("test-key");
  });
  it("reports missing configuration without returning environment details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("NOT_CONFIGURED"); expect(body).not.toContain("GEMINI_API_KEY");
  });
});

describe("provider reliability", () => {
  it.each(VOICE_VARIANTS)("resolves $id to its provider voice and replaces the default with edited direction", async (variant) => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse()); vi.stubGlobal("fetch", fetchMock);
    const direction = "Use natural Andhra Telugu pronunciation. ".padEnd(MAX_DIRECTION, " ");
    const response = await POST(request({ text: input.text, direction, variantId: variant.id }));
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content[0].text).toBe(input.text);
    expect(body.input[0].content[0].annotations[0].style).toBe(`${direction}\n\n${TRANSCRIPT_FIDELITY_INSTRUCTION}`);
    expect(body.generation_config.speech_config[0].voice).toBe(variant.voice);
  });
  it("uses the selected profile baseline for blank direction without changing the spoken text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateSpeech({ ...input, direction: "  " });
    const content = JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content[0];
    expect(content.text).toBe(input.text);
    expect(content.annotations[0].style).toBe(`${getVoiceVariant(input.variantId)!.profile.baseDirection}\n\n${TRANSCRIPT_FIDELITY_INSTRUCTION}`);
  });
  it("aborts a stalled provider after the deadline", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      providerSignal = init.signal;
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const generation = generateSpeech(input);
    const assertion = expect(generation).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS);
    await assertion; expect(providerSignal?.aborted).toBe(true);
  });
  it("cancels on client disconnect", async () => {
    const client = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const generation = generateSpeech(input, client.signal);
    const assertion = expect(generation).rejects.toMatchObject({ code: "CANCELLED" });
    client.abort(); await assertion;
  });
  it("maps network failures safely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive-url")));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 503 });
  });
  it.each([
    ["missing audio", () => Response.json({ steps: [] })],
    ["invalid JSON", () => new Response("{", { headers: { "Content-Type": "application/json" } })],
    ["invalid base64", () => providerResponse("!!!!")],
    ["odd PCM length", () => providerResponse("AQ==")],
    ["empty audio", () => providerResponse("")],
    ["wrong format", () => providerResponse(undefined, "audio/mpeg")],
    ["wrong sample rate", () => providerResponse(undefined, "audio/l16;rate=16000")],
  ])("rejects %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: "INVALID_AUDIO", status: 502 });
  });
  it("rejects audio exceeding the deployment response limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(Buffer.alloc(MAX_PCM_BYTES + 2).toString("base64"))));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: "AUDIO_TOO_LONG" });
  });
});

describe("WAV format", () => {
  it("writes exact RIFF size, PCM format, sample rate, byte rate, alignment and data length", () => {
    const wav = pcmToWav(pcm); const view = new DataView(wav.buffer);
    expect(Buffer.from(wav.subarray(0, 4)).toString()).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + pcm.length);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(pcm.length);
    expect(isValidWav(wav)).toBe(true);
  });
  it("rejects empty/unaligned PCM and corrupted WAV headers", () => {
    expect(() => pcmToWav(new Uint8Array())).toThrow();
    expect(() => pcmToWav(new Uint8Array(3))).toThrow();
    const wav = pcmToWav(pcm); wav[4] = 0;
    expect(isValidWav(wav)).toBe(false);
  });
});
