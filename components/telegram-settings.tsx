"use client";
import { useEffect, useRef, useState } from "react";
import { connectTelegram, disconnectTelegram, findTelegramGroups, loadTelegram, storeTelegram, type TelegramGroup } from "@/lib/telegram";
export function TelegramSettings() {
  const [token, setToken] = useState(""); const [chatId, setChatId] = useState(""); const [topicId, setTopicId] = useState("");
  const [connected, setConnected] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [groups, setGroups] = useState<TelegramGroup[]>([]); const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    try { const saved = loadTelegram(); if (saved) { setToken(saved.token); setChatId(saved.chatId); setTopicId(saved.topicId); setConnected(saved.title); } }
    catch { setError("Saved Telegram settings could not be read. Reconnect or remove the connection."); }
    return () => { pending.current?.abort(); pending.current = null; };
  }, []);
  async function run(action: "find" | "connect") {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "find") {
        const found = await findTelegramGroups(token, controller.signal);
        if (controller.signal.aborted) return;
        setGroups(found);
        if (!found.length) setNotice("Add the bot to your group and send /start@YourBotUsername there, then click Find groups again.");
      } else {
        const value = await connectTelegram(token, chatId, topicId, controller.signal);
        if (controller.signal.aborted) return;
        storeTelegram(value); setChatId(value.chatId); setConnected(value.title); setNotice("Connection saved. Use Save to Telegram on a voiceover to upload it.");
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Telegram settings could not be saved."); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <section className="telegram-settings" aria-label="Telegram settings">
    <p className="section-hint">Save selected WAV files to your Telegram group.</p>
    <ol className="telegram-steps"><li>Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather</a> and paste its token below.</li><li>Add the bot to your group and allow it to send files.</li><li>Enter your group ID, or send <code>/start@YourBotUsername</code> in the group and click Find groups.</li></ol>
    {connected && <p className="telegram-connected">Saved group: <strong>{connected}</strong></p>}
    <form className="new-key-form" onSubmit={(event) => { event.preventDefault(); void run("connect"); }}>
      <label className="key-field-label">Telegram bot token<input type="password" className="key-edit-input" autoComplete="off" spellCheck={false} value={token} disabled={busy} onChange={(event) => { setToken(event.target.value); setGroups([]); }} placeholder="Token from BotFather" /></label>
      <div><button className="preview-button" type="button" disabled={busy || !token.trim()} onClick={() => void run("find")}>Find groups</button></div>
      {groups.length > 0 && <label className="key-field-label">Found groups<select className="key-edit-input" value={groups.some((group) => group.id === chatId) ? chatId : ""} disabled={busy} onChange={(event) => setChatId(event.target.value)}><option value="" disabled>Choose a group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label>}
      <label className="key-field-label">Group ID or @username<input className="key-edit-input" value={chatId} disabled={busy} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890 or @yourgroup" /></label>
      <label className="key-field-label">Topic ID <span className="optional">(optional)</span><input className="key-edit-input" inputMode="numeric" value={topicId} disabled={busy} onChange={(event) => setTopicId(event.target.value)} placeholder="Leave blank for the main group" /></label>
      <div className="settings-actions"><button type="button" className="preview-button" disabled={busy} onClick={() => { try { disconnectTelegram(); setToken(""); setChatId(""); setTopicId(""); setConnected(""); setGroups([]); setError(""); setNotice("Telegram connection removed from this browser."); } catch { setError("This browser couldn’t remove the saved connection."); } }}>Remove connection</button><button type="submit" className="generate-button" disabled={busy || !token.trim() || !chatId.trim()}>{busy ? "Checking…" : "Connect & save"}</button></div>
    </form>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="field-hint" role="status">{notice}</p>}
    <p className="field-hint">Connection details stay in this browser’s plain-text storage. Files upload directly to Telegram only when you press Save to Telegram. Connecting checks access without posting a message.</p>
  </section>;
}
