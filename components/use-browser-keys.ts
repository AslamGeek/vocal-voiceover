"use client";
import { useEffect, useState } from "react";
import { emptyKeys, loadBrowserKeys, updateBrowserKeys, type BrowserKeys } from "@/lib/browser-keys";
export function useBrowserKeys() {
  const [saved, setSaved] = useState(emptyKeys);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void loadBrowserKeys().then((value) => { if (alive) { setSaved(value); setReady(true); } }).catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : "Browser key storage is unavailable.");
    });
    return () => { alive = false; };
  }, []);
  async function reload() {
    try { setSaved(await loadBrowserKeys()); setReady(true); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Browser key storage is unavailable."); }
  }
  async function change(update: (current: BrowserKeys) => BrowserKeys) {
    const value = await updateBrowserKeys(update);
    setSaved(value); setReady(true); setError("");
  }
  return { saved, ready, error, reload, change, apiKey: saved.keys.find((key) => key.id === saved.activeId)?.value ?? "" };
}
