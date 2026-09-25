import { AppError, validateRequest } from "@/lib/contracts";
import { generateSpeech } from "@/lib/server/tts";
import { fitsSection } from "@/lib/script";
export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_BODY_BYTES = 16_000;
async function readRequest(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.", 415);
  const origin = request.headers.get("origin");
  if (origin) {
    let allowed = false;
    try {
      const parsed = new URL(origin);
      // Next may normalize request.url to an internal hostname behind a proxy.
      // Browsers cannot override Host; do not trust X-Forwarded-Host here.
      const host = request.headers.get("host") ?? new URL(request.url).host;
      allowed = ["http:", "https:"].includes(parsed.protocol) && parsed.host === host;
    } catch { /* Malformed and opaque origins are rejected. */ }
    if (!allowed) throw new AppError("FORBIDDEN", "This request isn’t allowed.", 403);
  }
  if (!request.body) throw new AppError("INVALID_JSON", "The request is invalid. Please try again.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new AppError("REQUEST_TOO_LARGE", "The request is too large. Shorten your script and instructions.", 413); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new AppError("INVALID_JSON", "The request is invalid. Please try again.", 400); }
  } finally { reader.releaseLock(); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const input = validateRequest(await readRequest(request));
    if (!fitsSection(input.text)) throw new AppError("SECTION_TOO_LONG", "Generate long scripts through the studio so they can be processed in sections.", 400);
    // The caller's key is request-scoped and never replaces the server environment.
    const authorization = request.headers.get("authorization");
    let apiKey: string | undefined;
    if (authorization !== null) {
      const match = /^Bearer (.+)$/i.exec(authorization);
      if (!match?.[1].trim() || match[1].length > 8192) throw new AppError("INVALID_API_KEY", "Enter one Gemini API key.", 400);
      apiKey = match[1].trim();
    }
    const wav = await generateSpeech(input, request.signal, apiKey);
    return new Response(wav, { headers: {
      "Content-Type": "audio/wav", "Content-Length": String(wav.byteLength),
      "Content-Disposition": 'attachment; filename="voiceover.wav"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const safe = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Voice generation is temporarily unavailable. Please try again.", 500);
    console.error("voiceover.request_failed", { code: safe.code, status: safe.status });
    return Response.json({ error: { code: safe.code, message: safe.message } }, {
      status: safe.status, headers: { "Cache-Control": "no-store", ...(safe.status === 429 ? { "Retry-After": "30" } : {}) },
    });
  }
}
