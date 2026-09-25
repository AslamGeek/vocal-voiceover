"use client";
import { useState } from "react";
import { getVoiceVariant, variantLabel } from "@/lib/voice-profiles";
import type { Audition } from "./use-auditions";

function ResultAudio({ row, label }: { row: Audition; label: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="audio-result">
    <audio controls src={row.url} preload="metadata" aria-label={`${label} voiceover`} onError={() => setFailed(true)} />
    {failed && <p className="error-message" role="alert">This audio couldn’t be played. Try downloading it or generating it again.</p>}
    <a href={row.url} download={row.filename} title={row.filename} className="download-button" aria-label={`Download ${label} WAV`}>↓ Download WAV</a>
  </div>;
}
export function AuditionResults({ results, loading }: { results: Audition[]; loading: boolean }) {
  const ready = results.filter((row) => row.status === "ready").length;
  const finished = results.filter((row) => !["queued", "generating"].includes(row.status)).length;
  return <section className="output-column" aria-labelledby="results-title">
    <div className="output-heading"><h2 id="results-title">Audition Results</h2><span className="output-tag">.WAV</span></div>
    <p className="audition-summary" role="status">{results.length ? loading ? `${finished} of ${results.length} complete · ${ready} ready` : `${ready} of ${results.length} auditions ready` : "Generated voiceovers will appear here."}</p>
    <div className="audition-list">
      {results.map((row) => {
        const variant = getVoiceVariant(row.variantId)!;
        const label = variantLabel(variant);
        return <section className="audition" key={row.variantId} aria-label={`${label} audition`}>
          <div className="audition-heading"><h3>{variant.profile.name}</h3><span>{variant.gender} · {variant.voice}</span></div>
          <p className="audition-status" role="status">{row.status === "queued" ? "Queued" : row.status === "generating" ? <><span className="spinner" aria-hidden="true" />{row.progress && row.progress.total > 1 ? `${row.progress.completed} of ${row.progress.total} sections complete` : "Generating…"}</> : row.status === "ready" ? "Ready" : row.status === "cancelled" ? "Cancelled" : "Failed"}</p>
          {row.error && <p className="error-message" role="alert">{row.error}</p>}
          {row.url && <ResultAudio key={row.url} row={row} label={label} />}
        </section>;
      })}
    </div>
    {results.length > 0 && <p className="audio-meta">24 kHz · Mono · 16-bit PCM</p>}
  </section>;
}
