import { afterEach, expect, it, vi } from "vitest";
import { requestVoiceover } from "@/lib/api-client";
import { pcmToWav } from "@/lib/audio";
const input = { text: "Hello", persona: "", voice: "Kore" as const };
afterEach(() => vi.unstubAllGlobals());
it("accepts a valid WAV as a playable Blob", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(pcmToWav(new Uint8Array(480)), { headers: { "Content-Type": "audio/wav" } })));
  const blob = await requestVoiceover(input, new AbortController().signal);
  expect(blob.type).toBe("audio/wav"); expect(blob.size).toBe(524);
});
it("rejects malformed successful audio responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken", { headers: { "Content-Type": "audio/wav" } })));
  await expect(requestVoiceover(input, new AbortController().signal)).rejects.toThrow("audio response was invalid");
});
it("never displays raw backend or platform error messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "secret stack trace" } }, { status: 500 })));
  await expect(requestVoiceover(input, new AbortController().signal)).rejects.toThrow("temporarily unavailable");
});
