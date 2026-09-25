"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_DIRECTION, MAX_SCRIPT_WORDS, countWords } from "@/lib/contracts";
import { DEFAULT_VARIANT_ID, VOICE_PROFILES, VOICE_VARIANTS, getVoiceVariant, variantLabel, type VoiceDirections, type VoiceVariantId } from "@/lib/voice-profiles";
import { useAuditions } from "./use-auditions";
import { useVoicePreviews } from "./use-voice-previews";
import { AuditionResults } from "./audition-results";
import { useBrowserKeys } from "./use-browser-keys";
import { KeySettings } from "./key-settings";

function SoundMark() {
  return <span className="sound-mark small" aria-hidden="true">{[14, 26, 36, 22, 12].map((height, i) => <i key={i} style={{ height }} />)}</span>;
}

export default function VoiceoverStudio() {
  const [text, setText] = useState("");
  const keys = useBrowserKeys();
  const apiKey = keys.apiKey;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"keys" | "telegram">("keys");
  const [directions, setDirections] = useState<VoiceDirections>(() => Object.fromEntries(VOICE_VARIANTS.map((variant) => [variant.id, variant.profile.baseDirection])) as VoiceDirections);
  const [selectedVoiceVariants, setSelectedVoiceVariants] = useState<VoiceVariantId[]>([DEFAULT_VARIANT_ID]);
  const [error, setError] = useState("");
  const auditions = useAuditions();
  const previews = useVoicePreviews();
  const scriptInput = useRef<HTMLTextAreaElement | null>(null);
  const studio = useRef<HTMLDivElement | null>(null);
  const words = countWords(text);
  const overLimit = words > MAX_SCRIPT_WORDS;
  const allVoicesSelected = selectedVoiceVariants.length === VOICE_VARIANTS.length;
  const previewVariant = previews.preview ? getVoiceVariant(previews.preview.variantId) : undefined;
  useEffect(() => { pauseAudio(); previews.reset(); }, [apiKey]);
  function pauseAudio() { studio.current?.querySelectorAll("audio").forEach((audio) => audio.pause()); }
  function updateDirection(variantId: VoiceVariantId, direction: string) {
    setDirections((current) => ({ ...current, [variantId]: direction }));
    setError("");
    if (previews.preview?.variantId === variantId) { pauseAudio(); previews.stop(); }
  }
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auditions.loading || !keys.ready || !apiKey) return;
    if (!selectedVoiceVariants.length) { setError("Select at least one voice."); return; }
    setError(""); pauseAudio(); previews.stop();
    try { await auditions.generate(text, directions, selectedVoiceVariants, apiKey); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check your transcript and direction."); }
  }

  return <div className="studio" ref={studio} onPlayCapture={(event) => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    const current = event.target;
    studio.current?.querySelectorAll("audio").forEach((audio) => { if (audio !== current) audio.pause(); });
  }}>
    <header className="masthead"><a href="/" className="wordmark" aria-label="Vocal home"><SoundMark /><span>vocal<span className="brand-dot">.</span></span></a><button type="button" className="preview-button" disabled={auditions.loading} onClick={() => { pauseAudio(); previews.stop(); setSettingsTab("keys"); setSettingsOpen(true); void keys.reload(); }}>Settings</button></header>
    {settingsOpen && <KeySettings initialTab={settingsTab} saved={keys.saved} error={keys.error} change={keys.change} close={() => setSettingsOpen(false)} retry={keys.reload} />}
    <main>
      <div className="page-heading"><h1>Voiceover studio</h1><span className="format-note">WAV <span>/</span> 24 kHz <span>/</span> 16-bit</span></div>
      {keys.error && <p role="alert" className="error-message">Saved keys couldn’t be loaded. Open Settings to retry.</p>}
      {keys.ready && !keys.error && !apiKey && <p className="field-hint">Add an API key in Settings to preview or generate voices.</p>}
      <div className="workspace">
        <form onSubmit={generate} className="input-column">
          <section className="script-section">
            <div className="label-row"><label htmlFor="transcript"><span className="step">01</span> Transcript</label><span className="character-count" id="script-count">{words.toLocaleString()} / {MAX_SCRIPT_WORDS.toLocaleString()} words</span></div>
            <div className="script-field">
              <textarea ref={scriptInput} id="transcript" name="text" value={text} onChange={(e) => setText(e.target.value)} required disabled={auditions.loading} aria-invalid={overLimit} aria-describedby={`script-hint script-count${overLimit ? " script-limit" : ""}`} placeholder="Enter your transcript…" className="script-input" />
              {text.length > 0 && <button className="clear-script" type="button" aria-label="Clear transcript" title="Clear transcript" disabled={auditions.loading} onClick={() => { setText(""); setError(""); scriptInput.current?.focus(); }}><span aria-hidden="true">×</span></button>}
            </div>
            <p className="field-hint" id="script-hint">Your transcript is read without rewriting or translation.</p>
            {overLimit && <p className="error-message" id="script-limit" role="alert">Keep your transcript to 3,000 words or fewer.</p>}
          </section>

          <section className="profiles-section" aria-labelledby="profiles-title">
            <div className="label-row"><h2 id="profiles-title"><span className="step">02</span> Voice Profiles</h2><span className="character-count">{selectedVoiceVariants.length} selected</span></div>
            <p className="section-hint" id="profiles-hint">Select voices and edit each direction for your transcript. Preview uses a short sample with that voice’s current direction.</p>
            <label className="select-all-voices"><input type="checkbox" checked={allVoicesSelected} disabled={auditions.loading}
              ref={(input) => { if (input) input.indeterminate = selectedVoiceVariants.length > 0 && !allVoicesSelected; }}
              onChange={(event) => { setSelectedVoiceVariants(event.target.checked ? VOICE_VARIANTS.map((variant) => variant.id) : []); setError(""); }}
            />Select all voices</label>
            <div className="profile-grid">
              {VOICE_PROFILES.map((profile) => <fieldset className="profile-card" key={profile.id} disabled={auditions.loading}>
                <legend>{profile.name}</legend><p>{profile.description}</p>
                {VOICE_VARIANTS.filter((variant) => variant.profile.id === profile.id).map((variant) => <div className="voice-settings" key={variant.id}>
                  <div className="profile-variant">
                  <label><input type="checkbox" checked={selectedVoiceVariants.includes(variant.id)} aria-label={variantLabel(variant)} aria-describedby="profiles-hint" onChange={(event) => {
                    setSelectedVoiceVariants((current) => event.target.checked ? [...current, variant.id] : current.filter((id) => id !== variant.id));
                    setError("");
                  }} /><span>{variant.gender}<small>{variant.voice}</small></span></label>
                  <button className="preview-button" type="button" aria-label={`Preview ${variantLabel(variant)}`} disabled={!keys.ready || !apiKey || (previews.preview?.loading && previews.preview.variantId === variant.id)} onClick={() => { pauseAudio(); void previews.load(variant.id, directions[variant.id], apiKey); }}>{previews.preview?.loading && previews.preview.variantId === variant.id ? "Loading…" : "Preview"}</button>
                  </div>
                  <div className="voice-direction-heading"><label htmlFor={`direction-${variant.id}`}>Direction</label><button className="preview-button" type="button" aria-label={`Reset ${variant.voice} direction`} disabled={directions[variant.id] === variant.profile.baseDirection} onClick={() => updateDirection(variant.id, variant.profile.baseDirection)}>Reset</button></div>
                  <div className="direction-field">
                    <textarea id={`direction-${variant.id}`} aria-label={`${variant.voice} direction`} className="persona-input voice-direction" maxLength={MAX_DIRECTION} value={directions[variant.id]} onChange={(event) => updateDirection(variant.id, event.target.value)} aria-describedby={`direction-count-${variant.id}`} />
                    {directions[variant.id].length > 0 && <button className="clear-script" type="button" aria-label={`Clear ${variant.voice} direction`} title="Clear direction" onClick={(event) => { updateDirection(variant.id, ""); event.currentTarget.parentElement?.querySelector("textarea")?.focus(); }}><span aria-hidden="true">×</span></button>}
                  </div>
                  <p className="field-hint" id={`direction-count-${variant.id}`}>{directions[variant.id].length.toLocaleString()} / {MAX_DIRECTION.toLocaleString()} characters{!directions[variant.id].trim() && " · Uses the default direction when blank."}</p>
                </div>)}
              </fieldset>)}
            </div>
            {!selectedVoiceVariants.length && <p className="field-hint">Select at least one voice to generate.</p>}
            {previews.preview && previewVariant && <div className="preview-panel" aria-label="Voice preview">
              <div className="preview-heading"><strong>{variantLabel(previewVariant)}</strong><button className="preview-button" type="button" onClick={previews.stop}>{previews.preview.loading ? "Cancel preview" : "Close preview"}</button></div>
              <p className="section-hint">{previewVariant.profile.previewScript}</p>
              {previews.preview.loading && <p role="status">Generating preview…</p>}
              {previews.preview.error && <p className="error-message" role="alert">{previews.preview.error}</p>}
              {previews.preview.url && <audio key={previews.preview.playId} controls autoPlay src={previews.preview.url} aria-label={`${variantLabel(previewVariant)} preview`} onError={previews.playbackFailed} />}
            </div>}
          </section>

          <div className="generate-row">{auditions.loading && <button className="generate-button cancel-button" type="button" onClick={auditions.cancel}>Cancel</button>}<button className="generate-button" type="submit" disabled={auditions.loading || !keys.ready || !apiKey || !text.trim() || overLimit || !selectedVoiceVariants.length}>{auditions.loading ? <><span className="spinner" />Generating…</> : <><SoundMark />Generate</>}</button></div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </form>
        <AuditionResults results={auditions.results} loading={auditions.loading} onTelegramSetup={() => { pauseAudio(); previews.stop(); setSettingsTab("telegram"); setSettingsOpen(true); }} />
      </div>
    </main>
  </div>;
}
