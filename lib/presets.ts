import { DEFAULT_PERSONA } from "./contracts";

const exactScript = "Read the script exactly as written. Do not translate, rewrite, or add words.";
export const DELIVERY_PRESETS = [
  {
    id: "telugu-ads", label: "Telugu ads", language: "Telugu",
    direction: DEFAULT_PERSONA,
  },
  {
    id: "english-ads", label: "English ads", language: "English",
    direction: `Natural conversational English for a local business ad. Warm, trustworthy, and confident, as if speaking to one customer. Medium pace with clear pronunciation of business names, prices, and offers. Gently emphasize the benefit and call to action. Avoid shouting or exaggerated sales delivery. ${exactScript}`,
  },
  {
    id: "english-shorts", label: "English Reels / Shorts", language: "English",
    direction: `Natural conversational English for a short social video. Friendly, confident, and lively. Give the opening line clear emphasis, then use a brisk but easy-to-follow pace. Use brief natural pauses between ideas and varied intonation. Keep the energy steady without shouting or sounding like an announcer. ${exactScript}`,
  },
  {
    id: "telugu-shorts", label: "Telugu Reels / Shorts", language: "Telugu",
    direction: `Natural Andhra Telugu for a short social video, speaking casually to one familiar listener. Warm, lively, and confident with everyday conversational intonation. Emphasize the opening line, then use a brisk but clear pace and brief natural pauses between ideas. Avoid formal newsreader delivery, exaggerated drama, or shouting. ${exactScript}`,
  },
  {
    id: "english-narration", label: "English narration / explainers", language: "English",
    direction: `Natural conversational English for an explanation or story. Calm, clear, and engaging, as if guiding one listener. Use a measured medium pace, natural pauses between ideas, and gentle emphasis on key details. Let questions and sentences have natural intonation. Avoid sales delivery and exaggerated drama. ${exactScript}`,
  },
  {
    id: "telugu-narration", label: "Telugu narration / explainers", language: "Telugu",
    direction: `Natural Andhra Telugu for an explanation or story. Warm, patient, and clear, as if explaining to one familiar listener. Use everyday conversational intonation, a measured medium pace, and natural pauses between ideas. Gently emphasize key details. Avoid formal newsreader delivery and exaggerated drama. ${exactScript}`,
  },
] as const;
export type DeliveryPresetId = (typeof DELIVERY_PRESETS)[number]["id"];
export const DEFAULT_PRESET_ID: DeliveryPresetId = "telugu-ads";
