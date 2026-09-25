"use client";
import { useEffect, useRef, useState } from "react";
import { addKeyLines, editSavedKey, type BrowserKeys, type SavedKey } from "@/lib/browser-keys";

export function KeySettings({ saved, error, change, close, retry, useServer }: {
  saved: BrowserKeys; error: string; change: (update: (value: BrowserKeys) => BrowserKeys) => Promise<void>;
  close: () => void; retry: () => Promise<void>; useServer: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SavedKey | null>(null);
  const [message, setMessage] = useState(""); const [failure, setFailure] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  async function save(update: (current: BrowserKeys) => BrowserKeys, message: string, clear = false, endEdit = false) {
    setBusy(true); setFailure(""); setMessage("");
    try { await change(update); if (clear) setText(""); if (endEdit) setEditing(null); setMessage(message); }
    catch (cause) { setFailure(cause instanceof Error ? cause.message : "Keys could not be saved."); }
    finally { setBusy(false); }
  }
  async function copyKey(key: SavedKey) {
    setFailure(""); setMessage("");
    try { await navigator.clipboard.writeText(key.value); setMessage(`${key.label} copied.`); }
    catch { setFailure("Copy wasn’t allowed by this browser. Use Edit to select and copy the key."); }
  }
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <div className="settings-heading"><h2 id="settings-title">Settings</h2><button type="button" className="preview-button" disabled={busy} aria-label="Close Settings" onClick={close}>×</button></div>
    <p className="section-hint">API keys are saved in this browser. Choose one for Preview and Generate.</p>
    {error && <div role="alert" className="error-message">{error}<div className="settings-actions"><button type="button" className="preview-button" onClick={() => void retry()}>Retry storage</button><button type="button" className="preview-button" onClick={() => { useServer(); close(); }}>Use server key for this session</button></div></div>}
    <fieldset className="saved-keys" disabled={busy || !!error}><legend>Active key</legend>
      <label className="saved-key-row"><input type="radio" name="active-key" checked={saved.activeId === null} onChange={() => void save((current) => ({ ...current, activeId: null }), "Using the server key.")} /><span>Server key<small>Configured in Vercel</small></span></label>
      {saved.keys.map((key) => <div className="saved-key-item" key={key.id}><div className="saved-key-row">
        <label><input type="radio" name="active-key" aria-label={key.label} checked={saved.activeId === key.id} onChange={() => void save((current) => {
          if (!current.keys.some((entry) => entry.id === key.id)) throw new Error("This key was removed in another tab. Reopen Settings.");
          return { ...current, activeId: key.id };
        }, `Using ${key.label}.`)} /><span>{key.label}<small>••••••••</small></span></label>
        <div className="key-row-actions"><button type="button" className="preview-button" aria-label={`Copy ${key.label}`} onClick={() => void copyKey(key)}>Copy</button><button type="button" className="preview-button" aria-label={`Edit ${key.label}`} onClick={() => { setEditing({ ...key }); setFailure(""); setMessage(""); }}>Edit</button><button type="button" className="preview-button" aria-label={`Delete ${key.label}`} onClick={() => void save((current) => ({ keys: current.keys.filter((entry) => entry.id !== key.id), activeId: current.activeId === key.id ? null : current.activeId }), saved.activeId === key.id ? "Key deleted. Using the server key." : "Key deleted.", false, editing?.id === key.id)}>Delete</button></div>
      </div>{editing?.id === key.id && <form className="key-edit-form" onSubmit={(event) => { event.preventDefault(); void save((current) => editSavedKey(current, editing.id, editing.label, editing.value), "Key updated.", false, true); }}>
        <label>Key label<input className="key-edit-input" value={editing.label} maxLength={80} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></label>
        <label>API key value<input className="key-edit-input" value={editing.value} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8192} onChange={(event) => setEditing({ ...editing, value: event.target.value })} /></label>
        <div className="settings-actions"><button className="preview-button" type="button" onClick={() => setEditing(null)}>Cancel edit</button><button className="generate-button" type="submit">Save changes</button></div>
      </form>}</div>)}
    </fieldset>
    <form onSubmit={(event) => { event.preventDefault(); void save((current) => addKeyLines(current, text), "Keys saved in this browser.", true); }}>
      <label htmlFor="new-api-keys" className="settings-input-label">Add API keys</label>
      <p id="keys-format" className="field-hint">One per line. Add a label if you like: Project name | API key</p>
      <div className="direction-field"><textarea id="new-api-keys" className="persona-input keys-input" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="keys-format" disabled={busy || !!error} placeholder={"Project 1 | paste key here\nProject 2 | paste another key here"} />{text && <button type="button" className="clear-script" aria-label="Clear new API keys" disabled={busy} onClick={() => setText("")}>×</button>}</div>
      <div className="settings-actions"><button type="submit" className="generate-button" disabled={busy || !!error || !text.trim()}>{busy ? "Saving…" : "Save keys"}</button></div>
    </form>
    {(failure || message) && <p role={failure ? "alert" : "status"} className={failure ? "error-message" : "field-hint"}>{failure || message}</p>}
    <p className="field-hint">Keys are stored as plain text on this browser and device. Clearing site data removes them. Keys from the same Google project share quota.</p>
  </dialog>;
}
