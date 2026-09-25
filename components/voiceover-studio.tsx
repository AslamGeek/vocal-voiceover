"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestVoiceover } from "@/lib/api-client";
import { useVoiceComparison, VoiceComparisonResults } from "./voice-comparison";
import { DEFAULT_PERSONA, DEFAULT_VOICE, MAX_PERSONA, MAX_TEXT, VOICES, validateRequest, type Voice } from "@/lib/contracts";

function SoundMark({ small = false }: { small?: boolean }) {
  return <span className={`sound-mark ${small ? "small" : ""}`} aria-hidden="true">{[14, 26, 36, 22, 12].map((height, i) => <i key={i} style={{ height }} />)}</span>;
}
export default function VoiceoverStudio() {
  const [text, setText] = useState("");
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE);
  const [compare, setCompare] = useState(false);
  const [comparedVoices, setComparedVoices] = useState<Voice[]>(VOICES.map((item) => item.id));
  const comparison = useVoiceComparison();
  const [loading, setLoading] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = loading || comparison.loading;
  const pending = useRef<AbortController | null>(null);
  const audioUrl = useRef<string | null>(null);
  useEffect(() => () => {
    pending.current?.abort();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Synchronous lock closes the gap before React commits disabled state.
    if (pending.current || comparison.loading) return;
    let input;
    try { input = validateRequest({ text, persona, voice }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check your script and try again."); return; }
    if (compare) {
      if (comparedVoices.length < 2) { setError("Select at least two voices to compare."); return; }
      setError("");
      await comparison.generate(input, comparedVoices);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError("");
    const timeout = setTimeout(() => controller.abort("timeout"), 115_000);
    try {
      const blob = await requestVoiceover(input, controller.signal);
      if (controller.signal.aborted) return;
      const nextUrl = URL.createObjectURL(blob);
      const oldUrl = audioUrl.current;
      audioUrl.current = nextUrl;
      setAudio(nextUrl);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    } catch (cause) {
      if (controller.signal.reason === "timeout") setError("Voice generation took too long. Please try again.");
      else if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Voice generation failed. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }
  return <div className="studio">
    <header className="masthead"><a href="/" className="wordmark" aria-label="Vocal home"><SoundMark small /><span>vocal<span className="brand-dot">.</span></span></a></header>
    <main>
      <div className="page-heading"><div><h1>Voiceover studio</h1></div><span className="format-note">WAV <span>/</span> 24 kHz <span>/</span> 16-bit</span></div>
      <form onSubmit={generate} className="workspace">
        <div className="input-column">
          <section className="script-section">
            <div className="label-row"><label htmlFor="script"><span className="step">01</span> Your script</label><span className="character-count" id="script-count">{text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}</span></div>
            <textarea id="script" name="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT} required disabled={busy} aria-describedby="script-hint script-count" placeholder="Enter your script…" className="script-input" />
            <p className="field-hint" id="script-hint">Your script is read without rewriting.</p>
          </section>
          <section className="direction-section">
            <div className="label-row"><label htmlFor="persona"><span className="step">02</span> Delivery direction</label><span className="optional">Optional</span></div>
            <p className="section-hint" id="persona-hint">Set the tone, pace, and pronunciation.</p>
            <textarea id="persona" name="persona" value={persona} onChange={(e) => setPersona(e.target.value)} maxLength={MAX_PERSONA} disabled={busy} aria-describedby="persona-hint" placeholder="Warm, conversational Andhra Telugu. Medium pace with natural pauses." className="persona-input" />
            <fieldset className="generation-mode" disabled={busy}>
              <legend>Generation mode</legend>
              <label><input type="radio" name="mode" checked={!compare} onChange={() => { setCompare(false); setError(""); }} />Single voice</label>
              <label><input type="radio" name="mode" checked={compare} onChange={() => { setCompare(true); setError(""); }} />Compare voices</label>
            </fieldset>
            {compare ? <fieldset className="voice-choices" disabled={busy} aria-describedby="comparison-hint">
              <legend>Choose 2–3 voices</legend>
              {VOICES.map((option) => <label key={option.id}><input type="checkbox" checked={comparedVoices.includes(option.id)} onChange={(event) => {
                setComparedVoices((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id));
              }} /><span>{option.label}<small>{option.description}</small></span></label>)}
              <p id="comparison-hint">{comparedVoices.length} voices · {comparedVoices.length} separate generations. Each uses the same script and direction.</p>
            </fieldset> : <div className="voice-row"><label htmlFor="voice">Voice</label><select id="voice" value={voice} disabled={busy} onChange={(e) => setVoice(e.target.value as Voice)}>{VOICES.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></div>}
          </section>
          <div className="generate-row"><button className="generate-button" type="submit" disabled={busy || !text.trim() || (compare && comparedVoices.length < 2)}>{busy ? <><span className="spinner" />{compare ? "Generating auditions…" : "Generating voice…"}</> : <><SoundMark small />{compare ? "Generate auditions" : "Generate voice"}</>}</button></div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </div>
        <section className={`output-column ${loading ? "is-generating" : ""}`} aria-labelledby="output-title">
          {compare ? <VoiceComparisonResults results={comparison.results} loading={comparison.loading} /> : <>
          <div className="output-heading"><h2 id="output-title">Your voiceover</h2><span className="output-tag">.WAV</span></div>
          <div className="output-center">
            <div className="sound-emblem"><SoundMark /></div>
            <div role="status" aria-live="polite" aria-atomic="true"><h3>{loading ? "Generating voice…" : audio ? "Voiceover ready" : "No voiceover yet"}</h3><p>{loading ? "This may take a moment." : audio ? "Play or download the audio." : "Enter a script, then select Generate voice."}</p></div>
          </div>
          {audio && <div className="audio-result"><audio key={audio} controls src={audio} preload="metadata" aria-label="Generated voiceover" onError={() => setError("This audio couldn’t be played. Try generating it again.")} /><a href={audio} download="voiceover.wav" className="download-button"><span aria-hidden="true">↓</span> Download WAV</a><p className="audio-meta">24 kHz · Mono · 16-bit PCM</p></div>}
          </>}
        </section>
      </form>
    </main>
  </div>;
}
