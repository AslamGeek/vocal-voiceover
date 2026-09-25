"use client";
import { useEffect, useRef, useState } from "react";
import { loadTelegram, sendTelegramWav } from "@/lib/telegram";
export function TelegramSave({ url, filename, label, onSetup, disabled = false }: { url: string; filename: string; label: string; onSetup?: () => void; disabled?: boolean }) {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ title: string; url?: string } | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  async function upload() {
    if (pending.current || saved || disabled) return;
    setError("");
    const controller = new AbortController(); pending.current = controller;
    try {
      const connection = loadTelegram();
      if (!connection) { setError("Connect your Telegram group in Settings first."); onSetup?.(); return; }
      setBusy(true);
      if (!url.startsWith("blob:")) throw new Error("This audio is unavailable. Generate it again.");
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("This audio is unavailable. Generate it again.");
      const result = await sendTelegramWav(connection, await response.blob(), filename, controller.signal);
      if (pending.current === controller) setSaved(result);
    } catch (cause) {
      if (pending.current === controller) setError(cause instanceof Error ? cause.message : "Couldn’t confirm the upload. Check Telegram before trying again.");
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div className="telegram-save">
    <button type="button" className="download-button telegram-button" aria-label={`Save ${label} to Telegram`} disabled={disabled || busy || !!saved} onClick={() => void upload()}>{busy ? "Uploading to Telegram…" : saved ? "Saved to Telegram" : "Save to Telegram"}</button>
    {busy && <button type="button" className="preview-button" onClick={() => { pending.current?.abort(); pending.current = null; setBusy(false); setError("Upload stopped. Check Telegram before trying again."); }}>Cancel upload</button>}
    {saved && <p className="field-hint" role="status">Saved to {saved.title}.{saved.url && <> <a href={saved.url} target="_blank" rel="noreferrer">Open in Telegram</a></>}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
