import { DEFAULT_VARIANT_ID, getVoiceVariant, type VoiceVariantId } from "./voice-profiles";
export const MAX_SCRIPT_WORDS = 3000;
export function countWords(text: string): number { return text.match(/\S+/gu)?.length ?? 0; }
export const MAX_DIRECTION = 1000;
export type GenerationRequest = { text: string; direction: string; variantId: VoiceVariantId };
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
  if (countWords(data.text) > MAX_SCRIPT_WORDS)
    throw new AppError("TEXT_TOO_LONG", "Keep your script to 3,000 words or fewer.", 400);
  if (data.direction !== undefined && (typeof data.direction !== "string" || data.direction.length > MAX_DIRECTION))
    throw new AppError("INVALID_DIRECTION", "Keep persona and direction to 1,000 characters or fewer.", 400);
  const variant = getVoiceVariant(data.variantId ?? DEFAULT_VARIANT_ID);
  if (!variant) throw new AppError("INVALID_VOICE", "Choose one of the available voice profiles.", 400);
  // Preserve submitted text, including whitespace and Unicode, exactly.
  return { text: data.text, direction: (data.direction as string | undefined) ?? "", variantId: variant.id };
}
