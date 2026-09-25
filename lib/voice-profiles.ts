// Prebuilt Gemini voices and genders:
// https://ai.google.dev/gemini-api/docs/speech-generation#prebuilt-voices
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
export const VOICE_PROFILES = [
  {
    id: "warm", name: "Warm & Inviting",
    description: "Friendly, trustworthy, approachable, reassuring.",
    baseDirection: "Speak warmly and naturally to one listener. Sound friendly, trustworthy, approachable, and reassuring. Use a comfortable conversational pace and gentle emphasis.",
    femaleVoice: "Sulafat", maleVoice: "Achird",
    previewScript: "Welcome. We're glad you're here. Let us help you find something that feels right for you.",
  },
  {
    id: "firm", name: "Firm & Clear",
    description: "Confident, articulate, direct, authoritative.",
    baseDirection: "Speak with confidence, clear articulation, and direct, authoritative delivery. Use deliberate phrasing and precise emphasis. Keep the tone assured and composed, without shouting.",
    femaleVoice: "Kore", maleVoice: "Orus",
    previewScript: "Here's what matters. Clear information, reliable service, and a decision you can make with confidence.",
  },
  {
    id: "upbeat", name: "Upbeat & Expressive",
    description: "Energetic, lively, engaging, conversational.",
    baseDirection: "Speak with lively, upbeat energy and expressive conversational intonation. Sound engaging and enthusiastic. Use a brisk but clear pace, with natural variation and short pauses.",
    femaleVoice: "Laomedeia", maleVoice: "Puck",
    previewScript: "Ready for something new? Let's take a look at the little ideas that can make a big difference today.",
  },
  {
    id: "calm", name: "Calm & Reassuring",
    description: "Composed, gentle, patient, steady.",
    baseDirection: "Speak gently with a calm, patient, reassuring tone. Maintain a steady, unhurried pace and soft emphasis. Give each idea a natural pause, with composed and consistent delivery.",
    femaleVoice: "Achernar", maleVoice: "Schedar",
    previewScript: "Take your time. We'll walk through this together, one clear and simple step at a time.",
  },
  {
    id: "premium", name: "Premium & Polished",
    description: "Refined, sophisticated, controlled, professional.",
    baseDirection: "Speak with refined, polished professionalism. Use controlled expression, precise articulation, and a measured flow. Sound sophisticated and assured, with understated emphasis and clean pauses.",
    femaleVoice: "Gacrux", maleVoice: "Algieba",
    previewScript: "Thoughtfully designed. Carefully considered. Discover the details that make an exceptional experience.",
  },
] as const;

export type VoiceProfile = (typeof VOICE_PROFILES)[number];
export type ProfileId = VoiceProfile["id"];
export type Gender = "Female" | "Male";
export type Voice = VoiceProfile["femaleVoice" | "maleVoice"];
export type VoiceVariantId = `${ProfileId}-female` | `${ProfileId}-male`;
export type VoiceVariant = { id: VoiceVariantId; profile: VoiceProfile; gender: Gender; voice: Voice };
export const VOICE_VARIANTS: readonly VoiceVariant[] = VOICE_PROFILES.flatMap((profile) => [
  { id: `${profile.id}-female` as const, profile, gender: "Female" as const, voice: profile.femaleVoice },
  { id: `${profile.id}-male` as const, profile, gender: "Male" as const, voice: profile.maleVoice },
]);
export const DEFAULT_VARIANT_ID: VoiceVariantId = "warm-female";
export const TRANSCRIPT_FIDELITY_INSTRUCTION = "Read the transcript exactly as written. Do not rewrite, translate, add, or omit words.";
export function getVoiceVariant(id: unknown): VoiceVariant | undefined { return VOICE_VARIANTS.find((variant) => variant.id === id); }
export function variantLabel(variant: VoiceVariant): string { return `${variant.profile.name} ${variant.gender} (${variant.voice})`; }
export function buildEffectiveDirection(profile: Pick<VoiceProfile, "baseDirection">, userDirection: string): string {
  return [profile.baseDirection, userDirection.trim() ? userDirection : "", TRANSCRIPT_FIDELITY_INSTRUCTION].filter(Boolean).join("\n\n");
}
