import { validateRequest, type GenerationRequest } from "./contracts";
import { isValidWav, joinWavSections } from "./audio";
import { splitScript } from "./script";
export type GenerationProgress = { completed: number; total: number };
export const SECTION_TIMEOUT_MS = 115_000;

export async function requestVoiceover(input: GenerationRequest, signal: AbortSignal, onProgress?: (progress: GenerationProgress) => void): Promise<Blob> {
  const validated = validateRequest(input);
  const sections = splitScript(validated.text).filter((section) => section.trim());
  const audio: Uint8Array<ArrayBuffer>[] = [];
  onProgress?.({ completed: 0, total: sections.length });
  for (const text of sections) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort("timeout"), SECTION_TIMEOUT_MS);
    try {
      audio.push(await requestSection({ ...validated, text }, controller.signal));
      signal.throwIfAborted();
      onProgress?.({ completed: audio.length, total: sections.length });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (controller.signal.reason === "timeout") throw new Error("Voice generation took too long. Please try again.");
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }
  signal.throwIfAborted();
  return joinWavSections(audio);
}

async function requestSection(input: GenerationRequest, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch("/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
  });
  if (!response.ok) {
    let code: unknown;
    try { code = (await response.json())?.error?.code; } catch { /* Platform error: use safe fallback. */ }
    const messages: Record<string, string> = {
      NOT_CONFIGURED: "Voice generation hasn’t been configured yet. Please contact the app owner.",
      RATE_LIMITED: "The voice service is busy. Wait a moment and try again.",
      TIMEOUT: "Voice generation took too long. Try again with a shorter script.",
      AUDIO_TOO_LONG: "This voiceover is too long. Shorten the script or use a faster delivery.",
      INVALID_AUDIO: "The voice service returned unusable audio. Please try again.",
      TEXT_TOO_LONG: "Keep your script to 3,000 words or fewer.",
      SECTION_TOO_LONG: "Reload the studio and try generating again.",
    };
    throw new Error(typeof code === "string" && messages[code] ? messages[code] : "Voice generation is temporarily unavailable. Please try again.");
  }
  if (!response.headers.get("content-type")?.includes("audio/wav")) throw new Error("The audio response was invalid. Please try again.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isValidWav(bytes)) throw new Error("The audio response was invalid. Please try again.");
  return bytes;
}
