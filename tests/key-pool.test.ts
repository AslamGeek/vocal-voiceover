import { afterEach, beforeEach, expect, it, vi } from "vitest";

let requestGemini: typeof import("@/lib/server/gemini-key-pool").requestGeminiWithFailover;
const payload = JSON.stringify({ model: "test-model", input: "not a real provider request" });
const success = () => Response.json({ ok: true });
const failure = (status: number, code?: string, headers?: Record<string, string>) => Response.json({ error: { code, message: "private provider message" } }, { status, headers });
const usedKeys = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map(([, init]) => init.headers["x-goog-api-key"]);
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEYS", "key1,key2,key3");
  vi.stubEnv("GEMINI_API_KEY", "legacy-key");
  vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "false");
  vi.stubEnv("GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  requestGemini = (await import("@/lib/server/gemini-key-pool")).requestGeminiWithFailover;
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const send = (signal = new AbortController().signal) => requestGemini(payload, signal);

it.each([
  [{ GEMINI_API_KEY: "", GEMINI_API_KEYS: "" }, "MISSING_KEY"],
  [{ GEMINI_API_KEY: "secret-one,secret-two", GEMINI_API_KEYS: "" }, "INVALID_SINGLE_KEY"],
  [{ GEMINI_API_KEY: "valid-single", GEMINI_API_KEYS: "secret-one," }, "INVALID_KEY_LIST"],
  [{ GEMINI_API_KEYS_INDEPENDENT_PROJECTS: "secret-incorrect-setting" }, "INVALID_QUOTA_SETTING"],
  [{ GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS: "secret-incorrect-setting" }, "INVALID_TRANSIENT_SETTING"],
])("identifies configuration failures without exposing values (%s)", async (environment, reason) => {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  const { POST } = await import("@/app/api/generate/route");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const response = await POST(new Request("http://localhost/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hello", direction: "", variantId: "warm-female" }),
  }));
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body.error).toMatchObject({ code: "NOT_CONFIGURED", configurationReason: reason });
  expect(fetchMock).not.toHaveBeenCalled();
  const exposed = JSON.stringify(body) + JSON.stringify(vi.mocked(console.error).mock.calls);
  for (const value of ["secret-one", "secret-two", "valid-single", "secret-incorrect-setting", "legacy-key"]) expect(exposed).not.toContain(value);
});

it("keeps legacy single-key behavior when the pool is unset or blank", async () => {
  vi.stubEnv("GEMINI_API_KEYS", "  ");
  vi.stubEnv("GEMINI_API_KEY", "  legacy-key  ");
  const fetchMock = vi.fn().mockResolvedValueOnce(success()).mockResolvedValueOnce(failure(429));
  vi.stubGlobal("fetch", fetchMock);
  expect((await send()).ok).toBe(true);
  await expect(send()).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  expect(usedKeys(fetchMock)).toEqual(["legacy-key", "legacy-key"]);
});

it("uses only the first key when it succeeds and gives the pool precedence", async () => {
  vi.stubEnv("GEMINI_API_KEYS", " key1 , key2 , key3 ");
  const fetchMock = vi.fn().mockResolvedValue(success()); vi.stubGlobal("fetch", fetchMock);
  await send();
  expect(usedKeys(fetchMock)).toEqual(["key1"]);
  expect(fetchMock.mock.calls[0][1].body).toBe(payload);
  expect(fetchMock.mock.calls[0][0]).not.toContain("key1");
});

it.each([401, 403])("fails over after %s and keeps the successful key active", async (status) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(failure(status)).mockResolvedValueOnce(success()).mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetchMock);
  await send(); await send();
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2", "key2"]);
  expect(fetchMock.mock.calls.every(([, init]) => init.body === payload)).toBe(true);
});

it("deduplicates keys and stops after exhausting each distinct key exactly once", async () => {
  vi.stubEnv("GEMINI_API_KEYS", "key1,key1, key2,key3,key2");
  const fetchMock = vi.fn(async () => failure(401)); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 503 });
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2", "key3"]);
});

it("visits the entire pool only once even when the active key is in the middle", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success()).mockImplementation(async () => failure(403));
  vi.stubGlobal("fetch", fetchMock);
  await send();
  await expect(send()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2", "key2", "key3", "key1"]);
});

it.each(["key1,,key2", "key1,", "key1,bad key", "key1,bad\r\nvalue", ",", "x".repeat(257)])("rejects malformed configuration without fetching or disclosing it", async (value) => {
  vi.stubEnv("GEMINI_API_KEYS", value);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it("resets the active key when the configured pool changes", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success()).mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetchMock); await send();
  vi.stubEnv("GEMINI_API_KEYS", "replacement1,replacement2"); await send();
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2", "replacement1"]);
});

it.each([400, 402, 404, 408, 413, 422, 499, 501])("does not rotate on ordinary request/unsupported errors (%s)", async (status) => {
  vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "true");
  vi.stubEnv("GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS", "true");
  const fetchMock = vi.fn(async () => failure(status)); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["safety", "prohibited_content", "recitation", "invalid_request", "INVALID_ARGUMENT", "failed_precondition"])("does not retry %s even when the HTTP status could allow failover", async (code) => {
  const fetchMock = vi.fn(async () => failure(403, code)); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not use same-project or unknown-project keys as extra quota", async () => {
  const fetchMock = vi.fn(async () => failure(429)); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  expect(usedKeys(fetchMock)).toEqual(["key1"]);
});

it("waits at least 30 seconds before eligible independent-project quota failover", async () => {
  vi.useFakeTimers(); vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "true");
  const fetchMock = vi.fn().mockResolvedValueOnce(failure(429)).mockResolvedValueOnce(success()); vi.stubGlobal("fetch", fetchMock);
  const pending = send();
  await vi.advanceTimersByTimeAsync(29_999); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect((await pending).ok).toBe(true);
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2"]);
});

it.each(["seconds", "date", "body"])("honors a longer provider backoff from %s", async (format) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T00:00:00Z"));
  vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "true");
  const response = format === "body"
    ? Response.json({ error: { code: "rate_limit_exceeded", details: [{ retryDelay: "45s" }] } }, { status: 429 })
    : failure(429, "rate_limit_exceeded", { "Retry-After": format === "seconds" ? "45" : "Fri, 25 Sep 2026 00:00:45 GMT" });
  const fetchMock = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(success()); vi.stubGlobal("fetch", fetchMock);
  const pending = send();
  await vi.advanceTimersByTimeAsync(44_999); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await pending;
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("preserves existing immediate transient errors by default", async () => {
  const fetchMock = vi.fn(async () => failure(503)); vi.stubGlobal("fetch", fetchMock);
  await expect(send()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 503 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("backs off on opted-in transient failover and never loops", async () => {
  vi.useFakeTimers(); vi.stubEnv("GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS", "true");
  const fetchMock = vi.fn(async () => failure(503)); vi.stubGlobal("fetch", fetchMock);
  const pending = send();
  const assertion = expect(pending).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 503 });
  await vi.advanceTimersByTimeAsync(999); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2000); await assertion;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(usedKeys(fetchMock)).toEqual(["key1", "key2", "key3"]);
});

it("cancellation before the first request prevents all network calls", async () => {
  const controller = new AbortController(); controller.abort();
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(send(controller.signal)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("cancellation on a failed response prevents trying another key", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(async () => { controller.abort(); return failure(401); }); vi.stubGlobal("fetch", fetchMock);
  await expect(send(controller.signal)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("cancellation during quota backoff clears the wait without further failover", async () => {
  vi.useFakeTimers(); vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "true");
  const controller = new AbortController();
  const fetchMock = vi.fn(async () => failure(429)); vi.stubGlobal("fetch", fetchMock);
  const pending = send(controller.signal); const assertion = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1000); controller.abort(); await assertion;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the original TTS deadline across backoff and every key attempt", async () => {
  vi.useFakeTimers(); vi.stubEnv("GEMINI_API_KEYS_INDEPENDENT_PROJECTS", "true");
  const { generateSpeech, TTS_TIMEOUT_MS } = await import("@/lib/server/tts");
  const fetchMock = vi.fn(async () => failure(429, undefined, { "Retry-After": "999999999999999" })); vi.stubGlobal("fetch", fetchMock);
  const pending = generateSpeech({ text: "Hello", direction: "", variantId: "warm-female" });
  const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
  await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS); await assertion;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("normalizes exhaustion through the route without exposing keys or provider details", async () => {
  const { POST } = await import("@/app/api/generate/route");
  const fetchMock = vi.fn(async () => Response.json({ error: { message: "key1 key2 key3 private details" } }, { status: 403 })); vi.stubGlobal("fetch", fetchMock);
  const response = await POST(new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hello", direction: "", variantId: "warm-female" }) }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: "PROVIDER_UNAVAILABLE", message: "Voice generation is temporarily unavailable. Please try again." } });
  const exposed = JSON.stringify([...response.headers]) + JSON.stringify(vi.mocked(console.error).mock.calls);
  for (const key of ["key1", "key2", "key3", "legacy-key"]) expect(exposed).not.toContain(key);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("does not fail over on unusable audio or safety blocks in successful HTTP responses", async () => {
  const { generateSpeech } = await import("@/lib/server/tts");
  const fetchMock = vi.fn(async () => Response.json({ error: { code: "safety" } })); vi.stubGlobal("fetch", fetchMock);
  await expect(generateSpeech({ text: "Hello", direction: "", variantId: "warm-female" })).rejects.toMatchObject({ code: "INVALID_AUDIO" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
