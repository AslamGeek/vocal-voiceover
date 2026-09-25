export const SAMPLE_RATE = 24000;
// Below Vercel's 4.5 MB response limit; approximately 83 seconds of mono PCM.
export const MAX_PCM_BYTES = 4_000_000;
export function pcmToWav(pcm: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!pcm.byteLength || pcm.byteLength % 2 || pcm.byteLength > MAX_PCM_BYTES)
    throw new Error("Invalid PCM length");
  const wav = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, i) => v.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF"); v.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE"); ascii(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, "data"); v.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}
export function isValidWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 46 || bytes.byteLength > MAX_PCM_BYTES + 44) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  return str(0, 4) === "RIFF" && str(8, 16) === "WAVEfmt " && str(36, 40) === "data"
    && v.getUint32(4, true) === bytes.byteLength - 8 && v.getUint32(16, true) === 16
    && v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1
    && v.getUint32(24, true) === SAMPLE_RATE && v.getUint32(28, true) === SAMPLE_RATE * 2
    && v.getUint16(32, true) === 2 && v.getUint16(34, true) === 16
    && v.getUint32(40, true) === bytes.byteLength - 44 && (bytes.byteLength - 44) % 2 === 0;
}
