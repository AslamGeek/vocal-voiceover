import type { Voice } from "./voice-profiles";

export function voiceoverFilename(text: string, voice: Voice, generatedAt = new Date()): string {
  const words = text.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim().split(/\s+/u).slice(0, 6).join("-");
  let title = "";
  // Keep Telugu letters intact and leave room for the timestamp on common filesystems.
  const encoder = new TextEncoder();
  for (const { segment } of new Intl.Segmenter("te", { granularity: "grapheme" }).segment(words)) {
    if (encoder.encode(title + segment).length > 120) break;
    title += segment;
  }
  title = title.replace(/-+$/u, "") || "voiceover";
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}`;
  const time = `${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}${pad(generatedAt.getSeconds())}`;
  return `${title}_${date}_${time}_${voice}.wav`;
}
