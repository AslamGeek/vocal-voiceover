"use client";
import { useEffect, useRef, useState } from "react";
import { addSavedKey, editSavedKey, removeSavedKey, type BrowserKeys, type SavedKey } from "@/lib/browser-keys";

export function KeySettings({ saved, error, change, close, retry }: {
  saved: BrowserKeys; error: string; change: (update: (value: BrowserKeys) => BrowserKeys) => Promise<void>;
  close: () => void; retry: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<SavedKey | null>(null);
  const [message, setMessage] = useState(""); const [failure, setFailure] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  async function save(update: (current: BrowserKeys) => BrowserKeys, message: string, clear = false, endEdit = false) {
    setBusy(true); setFailure(""); setMessage("");
    try { await change(update); if (clear) { setText(""); setLabel(""); } if (endEdit) setEditing(null); setMessage(message); }
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
    {error && <div role="alert" className="error-message">{error}<div className="settings-actions"><button type="button" className="preview-button" onClick={() => void retry()}>Retry storage</button></div></div>}
    <fieldset className="saved-keys" disabled={busy || !!error}><legend>Active key</legend>
      {!saved.keys.length && <p className="section-hint">Add your first API key below.</p>}
      {saved.keys.map((key) => <form className="saved-key-item" key={key.id} onSubmit={(event) => { event.preventDefault(); if (editing?.id === key.id) void save((current) => editSavedKey(current, editing.id, editing.label, editing.value), "Key updated.", false, true); }}><div className="saved-key-row">
        <strong>{key.label}</strong><label className="use-key"><input type="radio" name="active-key" aria-label={`Use ${key.label}`} checked={saved.activeId === key.id} onChange={() => void save((current) => {
          if (!current.keys.some((entry) => entry.id === key.id)) throw new Error("This key was removed in another tab. Reopen Settings.");
          return { ...current, activeId: key.id };
        }, `Using ${key.label}.`)} /><span>{saved.activeId === key.id ? "In use" : "Use this key"}</span></label>
      </div>
        {editing?.id === key.id && <label className="key-field-label">Key label<input className="key-edit-input" value={editing.label} maxLength={80} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></label>}
        <input className="key-edit-input saved-key-input" aria-label={`API key for ${key.label}`} value={editing?.id === key.id ? editing.value : key.value} readOnly={editing?.id !== key.id} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8192} onChange={(event) => { if (editing?.id === key.id) setEditing({ ...editing, value: event.target.value }); }} />
        <div className="key-row-actions"><button type="button" className="preview-button" aria-label={`Copy ${key.label}`} onClick={() => void copyKey(key)}>Copy</button>
          {editing?.id === key.id ? <><button className="generate-button" type="submit">Save changes</button><button className="preview-button" type="button" onClick={() => setEditing(null)}>Cancel edit</button></> : <button type="button" className="preview-button" aria-label={`Edit ${key.label}`} onClick={() => { setEditing({ ...key }); setFailure(""); setMessage(""); }}>Edit</button>}
          <button type="button" className="preview-button" aria-label={`Delete ${key.label}`} onClick={() => void save((current) => removeSavedKey(current, key.id), "Key deleted.", false, editing?.id === key.id)}>Delete</button>
        </div>
      </form>)}
    </fieldset>
    <form className="new-key-form" onSubmit={(event) => { event.preventDefault(); void save((current) => addSavedKey(current, label, text), "Key saved in this browser.", true); }}>
      <h3>Add a key</h3>
      <label className="key-field-label">New key label <span className="optional">(optional)</span><input className="key-edit-input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} disabled={busy || !!error} placeholder="For example, Project 1" /></label>
      <label className="key-field-label">New API key<input className="key-edit-input" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8192} disabled={busy || !!error} placeholder="Paste an API key" /></label>
      <div className="settings-actions"><button type="submit" className="generate-button" disabled={busy || !!error || !text.trim()}>{busy ? "Saving…" : "Add key"}</button></div>
    </form>
    {(failure || message) && <p role={failure ? "alert" : "status"} className={failure ? "error-message" : "field-hint"}>{failure || message}</p>}
    <p className="field-hint">Keys are stored as plain text on this browser and device. Clearing site data removes them. Keys from the same Google project share quota.</p>
  </dialog>;
}
