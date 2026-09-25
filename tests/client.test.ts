import { afterEach, expect, it, vi } from "vitest";
import { requestVoiceover, SECTION_TIMEOUT_MS } from "@/lib/api-client";
import { pcmToWav, MAX_PCM_BYTES } from "@/lib/audio";
import { fitsSection, splitScript } from "@/lib/script";
const input = { text: "Hello", persona: "", voice: "Kore" as const };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("accepts a valid WAV as a playable Blob", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(pcmToWav(new Uint8Array(480)), { headers: { "Content-Type": "audio/wav" } })));
  const blob = await requestVoiceover(input, new AbortController().signal);
  expect(blob.type).toBe("audio/wav"); expect(blob.size).toBe(524);
});
it("rejects malformed successful audio responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken", { headers: { "Content-Type": "audio/wav" } })));
  await expect(requestVoiceover(input, new AbortController().signal)).rejects.toThrow("audio response was invalid");
});
it("never displays raw backend or platform error messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "secret stack trace" } }, { status: 500 })));
  await expect(requestVoiceover(input, new AbortController().signal)).rejects.toThrow("temporarily unavailable");
});

it("splits long English and Telugu scripts without losing or reordering text", () => {
  const text = "  Hello, world!\nనమస్కారం అందరికీ. ఇది ఒక పరీక్ష.  ".repeat(200);
  const sections = splitScript(text);
  expect(sections.length).toBeGreaterThan(1);
  expect(sections.join("")).toBe(text);
  expect(sections.every(fitsSection)).toBe(true);
  const longToken = "నమస్కారం👩🏽‍💻".repeat(200);
  const tokens = splitScript(longToken);
  expect(tokens.join("")).toBe(longToken);
  expect(tokens.every(fitsSection)).toBe(true);
  expect(tokens.every((token) => !/^[\uDC00-\uDFFF]/u.test(token))).toBe(true);
});

it("generates all 3,000 words in order with consistent direction and reports progress", async () => {
  const text = "నమస్కారం ప్రపంచం!\n".repeat(1500);
  const sent: typeof input[] = [];
  const pcm = new Uint8Array([1, 2, 3, 4]);
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(pcmToWav(pcm), { headers: { "Content-Type": "audio/wav" } });
  }));
  const progress = vi.fn();
  const blob = await requestVoiceover({ ...input, text }, new AbortController().signal, progress);
  expect(sent.length).toBeGreaterThan(1);
  expect(sent.map((request) => request.text).join("")).toBe(text);
  expect(sent.every((request) => request.voice === input.voice && request.persona === input.persona && fitsSection(request.text))).toBe(true);
  expect(progress).toHaveBeenLastCalledWith({ completed: sent.length, total: sent.length });
  const wav = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(wav.buffer);
  expect(view.getUint32(4, true)).toBe(36 + sent.length * pcm.length);
  expect(view.getUint32(40, true)).toBe(sent.length * pcm.length);
  expect(wav.subarray(44)).toEqual(new Uint8Array(Array.from({ length: sent.length }, () => [...pcm]).flat()));
});

it("produces a combined WAV larger than the per-request response limit", async () => {
  const pcm = new Uint8Array(MAX_PCM_BYTES);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(pcmToWav(pcm), { headers: { "Content-Type": "audio/wav" } })));
  const blob = await requestVoiceover({ ...input, text: "word ".repeat(101) }, new AbortController().signal);
  expect(blob.size).toBe(MAX_PCM_BYTES * 2 + 44);
});

it("rejects more than 3,000 words without making a request", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(requestVoiceover({ ...input, text: "word ".repeat(3001) }, new AbortController().signal)).rejects.toThrow("3,000 words");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("stops after a failed section and never returns an incomplete voiceover", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(pcmToWav(new Uint8Array(2)), { headers: { "Content-Type": "audio/wav" } }))
    .mockResolvedValueOnce(Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestVoiceover({ ...input, text: "word ".repeat(300) }, new AbortController().signal)).rejects.toThrow("busy");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("stops subsequent sections when cancelled", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(async () => new Response(pcmToWav(new Uint8Array(2)), { headers: { "Content-Type": "audio/wav" } }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestVoiceover({ ...input, text: "word ".repeat(300) }, controller.signal, ({ completed }) => {
    if (completed === 1) controller.abort();
  })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("times out each stalled section and cancels its request", async () => {
  vi.useFakeTimers();
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
    requestSignal = init.signal;
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));
  const pending = requestVoiceover(input, new AbortController().signal);
  const assertion = expect(pending).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(SECTION_TIMEOUT_MS);
  await assertion;
  expect(requestSignal?.aborted).toBe(true);
});

it("allows a full voiceover to run longer than one section's deadline", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(pcmToWav(new Uint8Array(2)), { headers: { "Content-Type": "audio/wav" } })), 60_000);
    init.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
  })));
  const pending = requestVoiceover({ ...input, text: "word ".repeat(300) }, new AbortController().signal);
  const assertion = expect(pending).resolves.toMatchObject({ type: "audio/wav", size: 50 });
  await vi.advanceTimersByTimeAsync(180_000);
  await assertion;
});
