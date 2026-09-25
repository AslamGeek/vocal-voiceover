import { AppError, type GenerationRequest } from "../contracts";
import { MAX_PCM_BYTES, pcmToWav } from "../audio";

export const TTS_TIMEOUT_MS = 90_000;
const MAX_PROVIDER_BYTES = Math.ceil(MAX_PCM_BYTES * 4 / 3) + 100_000;
const unavailable = () => new AppError("PROVIDER_UNAVAILABLE", "Voice generation is temporarily unavailable. Please try again.", 503);
const invalidAudio = () => new AppError("INVALID_AUDIO", "The voice service returned unusable audio. Please try again.", 502);
const tooLong = () => new AppError("AUDIO_TOO_LONG", "This voiceover is too long. Shorten the script or use a faster delivery.", 422);
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
// REST audio lives in model_output steps; output_audio is an SDK convenience.
function readAudio(payload: unknown): Uint8Array {
  const steps = record(payload)?.steps;
  if (!Array.isArray(steps)) throw invalidAudio();
  const audio = steps.flatMap((step) => {
    const item = record(step);
    return item?.type === "model_output" && Array.isArray(item.content) ? item.content : [];
  }).map(record).filter((part) => part?.type === "audio").at(-1);
  const data = audio?.data;
  const mime = audio?.mime_type;
  if (typeof data !== "string" || !data.length || typeof mime !== "string"
    || !/^audio\/l16(?:\s*;.*)?$/i.test(mime)
    || /rate=(?!24000(?:;|$))\d+/i.test(mime)
    || (audio?.sample_rate !== undefined && audio.sample_rate !== 24000)
    || (audio?.channels !== undefined && audio.channels !== 1)
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw invalidAudio();
  if (data.length > Math.ceil(MAX_PCM_BYTES / 3) * 4) throw tooLong();
  const pcm = Buffer.from(data, "base64");
  if (pcm.toString("base64") !== data || !pcm.length || pcm.length % 2) throw invalidAudio();
  if (pcm.length > MAX_PCM_BYTES) throw tooLong();
  return pcm;
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json") || !response.body) throw invalidAudio();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PROVIDER_BYTES) { await reader.cancel(); throw tooLong(); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw invalidAudio(); }
  } finally { reader.releaseLock(); }
}
export async function generateSpeech(input: GenerationRequest, clientSignal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    console.error("voiceover.configuration_missing", { key: "GEMINI_API_KEY" });
    throw new AppError("NOT_CONFIGURED", "Voice generation hasn’t been configured yet. Please contact the app owner.", 503);
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TTS_TIMEOUT_MS);
  const cancel = () => controller.abort();
  clientSignal?.addEventListener("abort", cancel, { once: true });
  if (clientSignal?.aborted) controller.abort();
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", signal: controller.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: "gemini-3.8-flash-tts", store: false,
        input: [{ type: "user_input", content: [{ type: "text", text: input.text,
          annotations: [{ type: "speech_metadata", style: input.persona || "Natural, clear, conversational delivery." }],
        }] }],
        response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: input.voice }] },
      }),
    });
    if (!response.ok) {
      console.error("voiceover.provider_failure", { status: response.status });
      await response.body?.cancel();
      if (response.status === 429) throw new AppError("RATE_LIMITED", "The voice service is busy. Wait a moment and try again.", 429);
      if (response.status === 408 || response.status === 504) throw new AppError("TIMEOUT", "Voice generation took too long. Try again with a shorter script.", 504);
      throw unavailable();
    }
    return pcmToWav(readAudio(await boundedJson(response)));
  } catch (error) {
    if (timedOut) throw new AppError("TIMEOUT", "Voice generation took too long. Try again with a shorter script.", 504);
    if (clientSignal?.aborted) throw new AppError("CANCELLED", "Voice generation was cancelled.", 499);
    if (error instanceof AppError) throw error;
    // Never log request text, secrets, URLs, or raw provider errors.
    console.error("voiceover.provider_connection_failed");
    throw unavailable();
  } finally {
    clearTimeout(timer);
    clientSignal?.removeEventListener("abort", cancel);
  }
}
