"use client";
import { useEffect, useRef, useState } from "react";
import { requestVoiceover } from "@/lib/api-client";
import { getVoiceVariant, type VoiceVariantId } from "@/lib/voice-profiles";

type Preview = { variantId: VoiceVariantId; playId: number; loading: boolean; url?: string; error?: string };
export function useVoicePreviews() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const cache = useRef(new Map<VoiceVariantId, { direction: string; url: string }>());
  const pending = useRef<{ variantId: VoiceVariantId; direction: string; controller: AbortController } | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => {
    pending.current?.controller.abort(); pending.current = null;
    cache.current.forEach(({ url }) => URL.revokeObjectURL(url)); cache.current.clear();
  }, []);

  async function load(variantId: VoiceVariantId, direction: string) {
    const variant = getVoiceVariant(variantId);
    if (!variant || (pending.current?.variantId === variantId && pending.current.direction === direction)) return;
    pending.current?.controller.abort(); pending.current = null;
    const playId = ++sequence.current;
    const cached = cache.current.get(variantId);
    if (cached?.direction === direction) { setPreview({ variantId, playId, loading: false, url: cached.url }); return; }
    if (cached) { URL.revokeObjectURL(cached.url); cache.current.delete(variantId); }
    const request = { variantId, direction, controller: new AbortController() };
    pending.current = request;
    setPreview({ variantId, playId, loading: true });
    try {
      const blob = await requestVoiceover({ text: variant.profile.previewScript, direction, variantId }, request.controller.signal);
      if (pending.current !== request || request.controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      cache.current.set(variantId, { direction, url });
      setPreview({ variantId, playId, loading: false, url });
    } catch (cause) {
      if (pending.current === request && !request.controller.signal.aborted) setPreview({ variantId, playId, loading: false, error: cause instanceof Error ? cause.message : "Preview could not be generated. Try again." });
    } finally { if (pending.current === request) pending.current = null; }
  }
  function stop() {
    pending.current?.controller.abort(); pending.current = null;
    setPreview(null);
  }
  function playbackFailed() {
    if (!preview?.url) return;
    URL.revokeObjectURL(preview.url); cache.current.delete(preview.variantId);
    setPreview({ ...preview, url: undefined, error: "This preview couldn’t be played. Select Preview to try again." });
  }
  return { preview, load, stop, playbackFailed };
}
