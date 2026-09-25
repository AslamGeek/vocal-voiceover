import "server-only";
import { AppError, CONFIGURATION_MESSAGES, type ConfigurationReason } from "../contracts";

type KeyPool = { keys: string[]; active: number; independentProjects: boolean; transientFailover: boolean; signature: string };
let currentPool: KeyPool | undefined;
const configurationError = (reason: ConfigurationReason) => new AppError("NOT_CONFIGURED", CONFIGURATION_MESSAGES[reason], 503, reason);
function flag(value: string | undefined, reason: ConfigurationReason): boolean {
  if (!value?.trim() || value.trim() === "false") return false;
  if (value.trim() === "true") return true;
  throw configurationError(reason);
}
function getPool(): KeyPool {
  const list = process.env.GEMINI_API_KEYS?.trim();
  if (!list && !process.env.GEMINI_API_KEY?.trim()) throw configurationError("MISSING_KEY");
  const keys = [...new Set(list ? list.split(",").map((key) => key.trim()) : [process.env.GEMINI_API_KEY?.trim() ?? ""])];
  // Validate safe token syntax without assuming a fixed provider key length.
  if (keys.some((key) => !/^[A-Za-z0-9_-]{1,256}$/.test(key))) throw configurationError(list ? "INVALID_KEY_LIST" : "INVALID_SINGLE_KEY");
  const independentProjects = flag(process.env.GEMINI_API_KEYS_INDEPENDENT_PROJECTS, "INVALID_QUOTA_SETTING");
  const transientFailover = flag(process.env.GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS, "INVALID_TRANSIENT_SETTING");
  const signature = JSON.stringify([keys, independentProjects, transientFailover]);
  if (!currentPool || currentPool.signature !== signature) currentPool = { keys, active: 0, independentProjects, transientFailover, signature };
  return currentPool;
}

const terminalCodes = new Set([
  "invalid_request", "invalid_argument", "failed_precondition", "out_of_range", "parameter_unknown",
  "safety", "recitation", "language", "prohibited_content", "spii", "blocklist", "content_blocked",
  "image_safety", "image_prohibited_content", "image_recitation", "image_other", "unimplemented",
  "malformed_function_call", "malformed_tool_call", "unexpected_tool_call", "no_image",
  "too_many_tool_calls", "missing_thought_signature", "cancelled", "payment_required",
]);
type ErrorMetadata = { terminal: boolean; retryMs?: number };
function inspectError(value: unknown, depth = 0): ErrorMetadata {
  if (!value || typeof value !== "object" || depth > 6) return { terminal: false };
  const result: ErrorMetadata = { terminal: false };
  for (const [name, field] of Object.entries(value)) {
    if (["code", "status", "reason", "blockReason", "finishReason"].includes(name) && typeof field === "string" && terminalCodes.has(field.toLowerCase())) result.terminal = true;
    if (name === "retryDelay" && typeof field === "string" && /^\d+(?:\.\d+)?s$/.test(field)) result.retryMs = Math.max(result.retryMs ?? 0, Number(field.slice(0, -1)) * 1000);
    if (typeof field === "object") {
      const nested = inspectError(field, depth + 1);
      result.terminal ||= nested.terminal;
      if (nested.retryMs !== undefined) result.retryMs = Math.max(result.retryMs ?? 0, nested.retryMs);
    }
  }
  return result;
}
async function readError(response: Response): Promise<ErrorMetadata> {
  if (!response.body) return { terminal: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      // Unknown/oversized error payloads are not evidence for safe failover.
      if (length > 16_384) return { terminal: true };
      chunks.push(value);
    }
    try { return inspectError(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
    catch { return { terminal: false }; }
  } finally { await reader.cancel(); reader.releaseLock(); }
}
function normalizedError(status: number): AppError {
  if (status === 429) return new AppError("RATE_LIMITED", "The voice service is busy. Wait a moment and try again.", 429);
  if (status === 408 || status === 504) return new AppError("TIMEOUT", "Voice generation took too long. Try again with a shorter script.", 504);
  return new AppError("PROVIDER_UNAVAILABLE", "Voice generation is temporarily unavailable. Please try again.", 503);
}
function retryDelay(response: Response, metadata: ErrorMetadata, fallback: number): number {
  const header = response.headers.get("retry-after");
  let delay = fallback;
  if (header !== null) {
    const parsed = /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now();
    if (!Number.isNaN(parsed)) delay = Math.max(delay, parsed);
  }
  return Math.max(delay, metadata.retryMs ?? 0);
}
async function backoff(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // A provider delay beyond the timer range must not overflow into a fast retry.
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, Math.min(ms, 2_147_483_647));
    signal.addEventListener("abort", abort, { once: true });
  });
  signal.throwIfAborted();
}

/** One logical request = one TTS section. One attempt per distinct key, one shared deadline. */
export async function requestGeminiWithFailover(body: string, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted();
  const pool = getPool();
  const start = pool.active;
  for (let attempt = 0; attempt < pool.keys.length; attempt++) {
    signal.throwIfAborted();
    const index = (start + attempt) % pool.keys.length;
    // Network failures are not evidence of an invalid key; the TTS layer normalizes them.
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", body, signal, cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "x-goog-api-key": pool.keys[index] },
    });
    if (signal.aborted) { await response.body?.cancel(); signal.throwIfAborted(); }
    if (response.ok) {
      // Don't let a late request on the old key undo another request's successful failover.
      if (pool.active === start) pool.active = index;
      return response;
    }
    console.error("voiceover.provider_failure", { status: response.status });
    const error = normalizedError(response.status);
    const metadata = await readError(response);
    signal.throwIfAborted();
    if (metadata.terminal || attempt + 1 === pool.keys.length) throw error;
    if (response.status === 401 || response.status === 403) continue;
    if (response.status === 429 && pool.independentProjects) {
      // Existing public rate-limit response asks for 30 seconds before retrying.
      await backoff(retryDelay(response, metadata, 30_000 * 2 ** Math.min(attempt, 5)), signal);
      continue;
    }
    if ([500, 502, 503, 504].includes(response.status) && pool.transientFailover) {
      await backoff(retryDelay(response, metadata, 1000 * 2 ** Math.min(attempt, 5)), signal);
      continue;
    }
    throw error;
  }
  // The loop always returns or throws, even when every configured key fails.
  throw normalizedError(503);
}
