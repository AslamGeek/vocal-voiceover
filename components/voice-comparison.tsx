"use client";
import { useEffect, useRef, useState } from "react";
import { requestVoiceover } from "@/lib/api-client";
import { VOICES, type GenerationRequest, type Voice } from "@/lib/contracts";

type Audition = { voice: Voice; status: "generating" | "ready" | "failed"; url?: string; error?: string };

function AuditionAudio({ voice, url, onPlay }: { voice: Voice; url: string; onPlay: (player: HTMLAudioElement) => void }) {
  const [failed, setFailed] = useState(false);
  return <div className="audio-result">
    <audio controls src={url} preload="metadata" aria-label={`${voice} voiceover`} onPlay={(event) => onPlay(event.currentTarget)} onError={() => setFailed(true)} />
    {failed && <p className="error-message" role="alert">{voice}: This audio couldn’t be played. Try downloading it or generating it again.</p>}
    <a href={url} download={`voiceover-${voice.toLowerCase()}.wav`} className="download-button" aria-label={`Download ${voice} WAV`}>↓ Download WAV</a>
  </div>;
}

export function useVoiceComparison() {
  const [results, setResults] = useState<Audition[]>([]);
  const [loading, setLoading] = useState(false);
  const active = useRef<{ controllers: AbortController[]; timers: ReturnType<typeof setTimeout>[] } | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => {
    active.current?.controllers.forEach((controller) => controller.abort());
    active.current?.timers.forEach(clearTimeout);
    active.current = null;
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
  }, []);

  async function generate(input: GenerationRequest, voices: Voice[]) {
    if (active.current || voices.length < 2 || voices.length > 3) return;
    const batch = { controllers: voices.map(() => new AbortController()), timers: [] as ReturnType<typeof setTimeout>[] };
    active.current = batch; // Lock before React updates.
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setResults(voices.map((voice) => ({ voice, status: "generating" })));
    setLoading(true);
    await Promise.all(voices.map(async (voice, index) => {
      const controller = batch.controllers[index];
      const timer = setTimeout(() => controller.abort("timeout"), 115_000);
      batch.timers.push(timer);
      try {
        const blob = await requestVoiceover({ ...input, voice }, controller.signal);
        if (active.current !== batch || controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setResults((rows) => rows.map((row) => row.voice === voice ? { voice, status: "ready", url } : row));
      } catch (cause) {
        if (active.current !== batch) return;
        const error = controller.signal.reason === "timeout" ? "Generation took too long. Try again."
          : cause instanceof Error ? cause.message : "Voice generation failed. Please try again.";
        setResults((rows) => rows.map((row) => row.voice === voice ? { voice, status: "failed", error } : row));
      } finally { clearTimeout(timer); }
    }));
    if (active.current === batch) { active.current = null; setLoading(false); }
  }
  return { results, loading, generate };
}

export function VoiceComparisonResults({ results, loading }: { results: Audition[]; loading: boolean }) {
  const players = useRef<HTMLDivElement>(null);
  function pauseOthers(current: HTMLAudioElement) {
    players.current?.querySelectorAll("audio").forEach((player) => { if (player !== current) player.pause(); });
  }
  const ready = results.filter((row) => row.status === "ready").length;
  const finished = results.filter((row) => row.status !== "generating").length;
  return <>
    <div className="output-heading"><h2 id="output-title">Voice auditions</h2><span className="output-tag">.WAV</span></div>
    <p className="comparison-status" role="status" aria-live="polite">{results.length
      ? loading ? `${finished} of ${results.length} complete · ${ready} ready to listen` : `${ready} of ${results.length} auditions ready`
      : "The same words and direction, in different voices."}</p>
    <div ref={players} className="audition-list">
      {results.map((row) => <section className="audition" key={row.voice} aria-label={`${row.voice} audition`}>
        <div className="audition-heading"><h3>{row.voice}</h3><span>{VOICES.find((voice) => voice.id === row.voice)?.description}</span></div>
        {row.status === "generating" && <p className="audition-pending"><span className="spinner" aria-hidden="true" />Generating voice…</p>}
        {row.status === "failed" && <p className="error-message" role="alert">{row.voice}: {row.error}</p>}
        {row.url && <AuditionAudio key={row.url} voice={row.voice} url={row.url} onPlay={pauseOthers} />}
      </section>)}
    </div>
    {!results.length && <div className="comparison-empty">Choose two or three voices, then generate your auditions.</div>}
    {results.length > 0 && <p className="audio-meta">24 kHz · Mono · 16-bit PCM</p>}
  </>;
}
