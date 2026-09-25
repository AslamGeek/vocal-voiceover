"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestVoiceover } from "@/lib/api-client";
import { MAX_PERSONA, MAX_TEXT, VOICES, validateRequest, type Voice } from "@/lib/contracts";

function SoundMark({ small = false }: { small?: boolean }) {
  return <span className={`sound-mark ${small ? "small" : ""}`} aria-hidden="true">{[14, 26, 36, 22, 12].map((height, i) => <i key={i} style={{ height }} />)}</span>;
}
export default function VoiceoverStudio() {
  const [text, setText] = useState("");
  const [persona, setPersona] = useState("");
  const [voice, setVoice] = useState<Voice>("Kore");
  const [loading, setLoading] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const audioUrl = useRef<string | null>(null);
  useEffect(() => () => {
    pending.current?.abort();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Synchronous lock closes the gap before React commits disabled state.
    if (pending.current) return;
    let input;
    try { input = validateRequest({ text, persona, voice }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check your script and try again."); return; }
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
    <header className="masthead"><a href="/" className="wordmark" aria-label="Vocal home"><SoundMark small /><span>vocal<span className="brand-dot">.</span></span></a><span className="masthead-note">A little direction. A voice of your own.</span></header>
    <main>
      <div className="page-heading"><div><p className="eyebrow">VOICEOVER STUDIO</p><h1>Give your words a voice.</h1></div><span className="format-note">WAV <span>/</span> 24 kHz <span>/</span> 16-bit</span></div>
      <form onSubmit={generate} className="workspace" aria-busy={loading}>
        <div className="input-column">
          <section className="script-section">
            <div className="label-row"><label htmlFor="script"><span className="step">01</span> Your script</label><span className="character-count" id="script-count">{text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}</span></div>
            <textarea id="script" name="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT} required disabled={loading} aria-describedby="script-hint script-count" placeholder="Write the words you want to bring to life…" className="script-input" />
            <p className="field-hint" id="script-hint">Your words, just as you wrote them.</p>
          </section>
          <section className="direction-section">
            <div className="label-row"><label htmlFor="persona"><span className="step">02</span> Delivery direction</label><span className="optional">Optional</span></div>
            <p className="section-hint" id="persona-hint">Describe the personality, pace, and feeling.</p>
            <textarea id="persona" name="persona" value={persona} onChange={(e) => setPersona(e.target.value)} maxLength={MAX_PERSONA} disabled={loading} aria-describedby="persona-hint" placeholder="Warm, trustworthy local expert. Conversational Andhra Telugu delivery. Confident, medium pace. Emphasize the offer and CTA." className="persona-input" />
            <div className="voice-row"><label htmlFor="voice">Voice</label><select id="voice" value={voice} disabled={loading} onChange={(e) => setVoice(e.target.value as Voice)}>{VOICES.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></div>
          </section>
          <div className="generate-row"><span>Make it sound like you mean it.</span><button className="generate-button" type="submit" disabled={loading || !text.trim()}>{loading ? <><span className="spinner" />Generating voice…</> : <><SoundMark small />Generate voice</>}</button></div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </div>
        <section className={`output-column ${loading ? "is-generating" : ""}`} aria-labelledby="output-title">
          <div className="output-heading"><h2 id="output-title">Your voiceover</h2><span className="output-tag">.WAV</span></div>
          <div className="output-center">
            <div className="sound-emblem"><SoundMark /></div>
            <div role="status" aria-live="polite" aria-atomic="true"><h3>{loading ? "Finding your voice…" : audio ? "Ready when you are." : "Ready to be heard."}</h3><p>{loading ? "Turning your words and direction into speech." : audio ? "Listen to your voiceover, then take it with you." : "Your voiceover will appear here.\nAdd your script and make it speak."}</p></div>
          </div>
          {audio ? <div className="audio-result"><audio key={audio} controls src={audio} preload="metadata" aria-label="Generated voiceover" onError={() => setError("This audio couldn’t be played. Try generating it again.")} /><a href={audio} download="voiceover.wav" className="download-button"><span aria-hidden="true">↓</span> Download WAV</a><p className="audio-meta">24 kHz · Mono · 16-bit PCM</p></div> : <div className="output-footer"><span className="empty-line" /><p>Listen. Download. Make it yours.</p></div>}
        </section>
      </form>
      <footer className="page-footer"><span>Made with words. Brought to life by AI.</span><span>AI-generated voice · Powered by Gemini</span></footer>
    </main>
  </div>;
}
