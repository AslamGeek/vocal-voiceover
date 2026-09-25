import { DEFAULT_VARIANT_ID, getVoiceVariant, type VoiceVariantId } from "./voice-profiles";
export const MAX_SCRIPT_WORDS = 3000;
export function countWords(text: string): number { return text.match(/\S+/gu)?.length ?? 0; }
export const MAX_DIRECTION = 1000;
export type GenerationRequest = { text: string; direction: string; variantId: VoiceVariantId };
// Fixed messages only: never interpolate environment values or provider errors.
export const CONFIGURATION_MESSAGES = {
  MISSING_KEY: "No API key is available to this deployment. Check the Production environment variables and redeploy.",
  INVALID_SINGLE_KEY: "The single API key has invalid formatting. Enter one key without quotes or a variable-name prefix.",
  INVALID_KEY_LIST: "The API key list has invalid formatting. Use comma-separated keys without quotes or empty entries. The list takes priority over the single key.",
  INVALID_QUOTA_SETTING: "The independent-projects setting must be true or false, or left unset.",
  INVALID_TRANSIENT_SETTING: "The transient-failover setting must be true or false, or left unset.",
} as const;
export type ConfigurationReason = keyof typeof CONFIGURATION_MESSAGES;
export class AppError extends Error {
  constructor(public code: string, message: string, public status: number, public configurationReason?: ConfigurationReason) {
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
