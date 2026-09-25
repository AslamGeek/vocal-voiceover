"use client";
import { useEffect, useRef, useState } from "react";
import { requestVoiceover, type GenerationProgress } from "@/lib/api-client";
import { validateRequest } from "@/lib/contracts";
import { getVoiceVariant, type VoiceDirections, type VoiceVariantId } from "@/lib/voice-profiles";
import { voiceoverFilename } from "@/lib/filename";

export const MAX_CONCURRENT_AUDITIONS = 2;
export type Audition = {
  variantId: VoiceVariantId; filename: string;
  status: "queued" | "generating" | "ready" | "failed" | "cancelled";
  url?: string; error?: string; progress?: GenerationProgress;
};

export function useAuditions() {
  const [results, setResults] = useState<Audition[]>([]);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => {
    active.current?.abort(); active.current = null;
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = [];
  }, []);

  async function generate(text: string, directions: VoiceDirections, variantIds: VoiceVariantId[], apiKey = "") {
    if (active.current) return;
    if (!variantIds.length) throw new Error("Select at least one voice.");
    const inputs = [...new Set(variantIds)].map((variantId) => validateRequest({ text, direction: directions[variantId], variantId }));
    const batch = new AbortController();
    active.current = batch; // Synchronous lock, before React commits disabled state.
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = [];
    const generatedAt = new Date();
    setResults(inputs.map((input) => ({ variantId: input.variantId, status: "queued", filename: voiceoverFilename(text, getVoiceVariant(input.variantId)!.voice, generatedAt) })));
    setLoading(true);
    let next = 0;
    const update = (variantId: VoiceVariantId, patch: Partial<Audition>) => {
      if (active.current === batch) setResults((rows) => rows.map((row) => row.variantId === variantId ? { ...row, ...patch } : row));
    };
    async function worker() {
      while (active.current === batch && !batch.signal.aborted && next < inputs.length) {
        const input = inputs[next++];
        update(input.variantId, { status: "generating" });
        try {
          const blob = await requestVoiceover(input, batch.signal, (progress) => update(input.variantId, { progress }), apiKey);
          if (active.current !== batch || batch.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          update(input.variantId, { status: "ready", url });
        } catch (cause) {
          if (active.current !== batch || batch.signal.aborted) return;
          update(input.variantId, { status: "failed", error: cause instanceof Error ? cause.message : "Voice generation failed. Please try again." });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_AUDITIONS, inputs.length) }, worker));
    if (active.current === batch) { active.current = null; setLoading(false); }
  }

  function cancel() {
    active.current?.abort(); active.current = null;
    setLoading(false);
    setResults((rows) => rows.map((row) => row.status === "queued" || row.status === "generating" ? { ...row, status: "cancelled" } : row));
  }
  return { results, loading, generate, cancel };
}
