import type { GenerationRequest } from "./contracts";
import { isValidWav } from "./audio";
export async function requestVoiceover(input: GenerationRequest, signal: AbortSignal): Promise<Blob> {
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
    };
    throw new Error(typeof code === "string" && messages[code] ? messages[code] : "Voice generation is temporarily unavailable. Please try again.");
  }
  if (!response.headers.get("content-type")?.includes("audio/wav")) throw new Error("The audio response was invalid. Please try again.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isValidWav(bytes)) throw new Error("The audio response was invalid. Please try again.");
  return new Blob([bytes], { type: "audio/wav" });
}
