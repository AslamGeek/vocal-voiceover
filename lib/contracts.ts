export const MAX_TEXT = 1000;
export const MAX_PERSONA = 1000;
export const VOICES = [
  { id: "Kore", label: "Kore", description: "Firm & clear" },
  { id: "Puck", label: "Puck", description: "Upbeat & expressive" },
  { id: "Sulafat", label: "Sulafat", description: "Warm & inviting" },
] as const;
export type Voice = (typeof VOICES)[number]["id"];
export const DEFAULT_VOICE: Voice = "Sulafat";
export const DEFAULT_PERSONA = "Warm, trustworthy local expert speaking naturally to one familiar listener. For Telugu text, use a native Andhra Telugu accent and everyday conversational intonation. Relaxed medium pace; short, natural pauses at punctuation. Clear pronunciation with gentle emphasis on the offer and call to action. Confident and friendly, without announcer-style projection or exaggerated drama. Preserve the script exactly; do not translate or add words.";
export type GenerationRequest = { text: string; persona: string; voice: Voice };
export class AppError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message); this.name = "AppError";
  }
}
export function validateRequest(value: unknown): GenerationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("INVALID_REQUEST", "Enter a script to generate a voiceover.", 400);
  const data = value as Record<string, unknown>;
  if (typeof data.text !== "string" || !data.text.trim())
    throw new AppError("INVALID_TEXT", "Enter a script to generate a voiceover.", 400);
  if (data.text.length > MAX_TEXT)
    throw new AppError("TEXT_TOO_LONG", "Keep your script to 1,000 characters or fewer.", 400);
  if (data.persona !== undefined && (typeof data.persona !== "string" || data.persona.length > MAX_PERSONA))
    throw new AppError("INVALID_PERSONA", "Keep delivery instructions to 1,000 characters or fewer.", 400);
  const voice = data.voice ?? DEFAULT_VOICE;
  if (!VOICES.some((item) => item.id === voice))
    throw new AppError("INVALID_VOICE", "Choose one of the available voices.", 400);
  // Preserve submitted text, including whitespace and Unicode, exactly.
  return { text: data.text, persona: (data.persona as string | undefined) ?? "", voice: voice as Voice };
}
