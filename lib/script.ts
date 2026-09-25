import { countWords } from "./contracts";

// Each response must fit the host's payload limit, even for Telugu or slower speech.
export const MAX_SECTION_WORDS = 100;
export const MAX_SECTION_CHARS = 800;
export function fitsSection(text: string): boolean {
  return text.length <= MAX_SECTION_CHARS && countWords(text) <= MAX_SECTION_WORDS;
}

// Prefer sentence boundaries, then whitespace, then Unicode graphemes for long tokens.
// Joining the sections reproduces the submitted script exactly.
export function splitScript(text: string): string[] {
  const sections: string[] = [];
  let current = "";
  const append = (part: string) => {
    if (current && !fitsSection(current + part)) { sections.push(current); current = ""; }
    current += part;
  };
  const sentences = new Intl.Segmenter("te", { granularity: "sentence" });
  const graphemes = new Intl.Segmenter("te", { granularity: "grapheme" });
  for (const { segment } of sentences.segment(text)) {
    if (fitsSection(segment)) { append(segment); continue; }
    for (const token of segment.match(/\S+\s*|\s+/gu) ?? []) {
      if (fitsSection(token)) { append(token); continue; }
      for (const { segment: grapheme } of graphemes.segment(token)) {
        if (!fitsSection(grapheme)) throw new Error("The script contains an unsupported text sequence.");
        append(grapheme);
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}
