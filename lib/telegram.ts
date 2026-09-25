import { isValidWav } from "./audio";
export type TelegramConnection = { token: string; chatId: string; title: string; topicId: string };
export type TelegramGroup = { id: string; title: string };
export const TELEGRAM_STORAGE = "vocal.telegram";
export const TELEGRAM_MAX_BYTES = 50_000_000;
export const TELEGRAM_TIMEOUT_MS = 120_000;
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
function tokenValue(value: string) {
  const token = value.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || token.length > 256) throw new Error("Enter the bot token provided by BotFather.");
  return token;
}
export function loadTelegram(): TelegramConnection | null {
  const raw = localStorage.getItem(TELEGRAM_STORAGE);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.token !== "string" || typeof value.chatId !== "string" || typeof value.title !== "string" || typeof value.topicId !== "string") throw new Error("Telegram settings could not be read. Reconnect in Settings.");
  return value;
}
export function storeTelegram(value: TelegramConnection) { localStorage.setItem(TELEGRAM_STORAGE, JSON.stringify(value)); }
export function disconnectTelegram() { localStorage.removeItem(TELEGRAM_STORAGE); }

// Send directly to Telegram: combined WAVs can exceed serverless upload limits.
// Telegram requires the bot token in its API path; never log fetch errors/URLs.
async function call(token: string, method: "getMe" | "getChat" | "getUpdates" | "sendDocument", body: URLSearchParams | FormData, signal?: AbortSignal): Promise<unknown> {
  const validToken = tokenValue(token);
  if (signal?.aborted) throw new Error("Upload stopped. Check Telegram before trying again.");
  const timeout = AbortSignal.timeout(method === "sendDocument" ? TELEGRAM_TIMEOUT_MS : 20_000);
  let response: Response; let payload: Record<string, unknown> | undefined;
  try {
    response = await fetch(`https://api.telegram.org/bot${validToken}/${method}`, {
      method: "POST", body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      mode: "cors", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
    });
    payload = record(await response.json());
  } catch {
    if (method === "sendDocument") throw new Error("Couldn’t confirm the upload. Check your Telegram group before trying again.");
    throw new Error("Couldn’t reach Telegram. Check your connection and try again.");
  }
  if (!response.ok || payload?.ok !== true) {
    const code = typeof payload?.error_code === "number" ? payload.error_code : response.status;
    if (code === 401 || code === 404) throw new Error("Telegram rejected the bot token. Check it in Settings.");
    if (code === 403) throw new Error("The bot cannot access this group. Add it to the group and allow it to send files.");
    if (code === 409) throw new Error("This bot is already used by another integration. Enter the group ID manually, or use a dedicated bot.");
    if (code === 429) throw new Error("Telegram is busy. Wait a moment before trying again.");
    if (code === 400) throw new Error("Check the group ID, topic ID, and the bot’s permission to send files. If the group was upgraded, reconnect it.");
    throw new Error(method === "sendDocument" ? "Telegram couldn’t confirm the upload. Check the group before trying again." : "Telegram is temporarily unavailable.");
  }
  return payload.result;
}
function group(value: unknown): TelegramGroup | undefined {
  const chat = record(value);
  if (!chat || !["group", "supergroup"].includes(String(chat.type)) || typeof chat.id !== "number" || !Number.isSafeInteger(chat.id) || chat.id >= 0 || typeof chat.title !== "string") return;
  return { id: String(chat.id), title: chat.title };
}
export async function findTelegramGroups(token: string, signal?: AbortSignal): Promise<TelegramGroup[]> {
  // No offset, webhook changes, or update acknowledgement; never save message text.
  const updates = await call(token, "getUpdates", new URLSearchParams({ limit: "100", timeout: "0" }), signal);
  if (!Array.isArray(updates)) throw new Error("Telegram returned an invalid response.");
  const groups = new Map<string, TelegramGroup>();
  for (const update of updates) {
    const item = record(update);
    for (const field of ["message", "my_chat_member", "chat_member"]) {
      const found = group(record(item?.[field])?.chat);
      if (found) groups.set(found.id, found);
    }
  }
  return [...groups.values()];
}
export async function connectTelegram(token: string, chatId: string, topicId: string, signal?: AbortSignal): Promise<TelegramConnection> {
  token = tokenValue(token); chatId = chatId.trim(); topicId = topicId.trim();
  if (!/^(?:-\d+|@[A-Za-z0-9_]+)$/.test(chatId)) throw new Error("Enter a group ID (for example -1001234567890) or @groupusername.");
  if (topicId && (!/^\d+$/.test(topicId) || !Number.isSafeInteger(Number(topicId)) || Number(topicId) < 1)) throw new Error("Enter a positive numeric topic ID, or leave it blank.");
  const me = record(await call(token, "getMe", new URLSearchParams(), signal));
  if (me?.is_bot !== true) throw new Error("Telegram could not verify this bot.");
  const chat = group(await call(token, "getChat", new URLSearchParams({ chat_id: chatId }), signal));
  if (!chat) throw new Error("Choose a Telegram group or supergroup.");
  return { token, chatId: chat.id, title: chat.title, topicId };
}
export async function sendTelegramWav(connection: TelegramConnection, blob: Blob, filename: string, signal: AbortSignal): Promise<{ title: string; url?: string }> {
  signal.throwIfAborted();
  if (!/^-\d+$/.test(connection.chatId) || (connection.topicId && (!/^\d+$/.test(connection.topicId) || !Number.isSafeInteger(Number(connection.topicId)) || Number(connection.topicId) < 1))) throw new Error("Reconnect your Telegram group in Settings.");
  if (blob.size > TELEGRAM_MAX_BYTES) throw new Error("This WAV exceeds Telegram’s 50 MB bot upload limit. Download it and upload it manually.");
  if (!/\.wav$/i.test(filename) || /[\r\n/\\]/.test(filename)) throw new Error("The WAV filename is invalid.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isValidWav(bytes, TELEGRAM_MAX_BYTES)) throw new Error("This WAV cannot be uploaded. Generate it again.");
  signal.throwIfAborted();
  const form = new FormData();
  form.set("chat_id", connection.chatId);
  if (connection.topicId) form.set("message_thread_id", connection.topicId);
  form.set("document", new Blob([bytes], { type: "audio/wav" }), filename);
  form.set("disable_notification", "true");
  const result = record(await call(connection.token, "sendDocument", form, signal));
  const chat = group(result?.chat);
  const messageId = result?.message_id;
  if (!chat || chat.id !== connection.chatId || !Number.isSafeInteger(messageId) || Number(messageId) < 1 || !record(result?.document)?.file_id)
    throw new Error("Couldn’t confirm the saved file. Check your Telegram group before trying again.");
  const username = record(result?.chat)?.username;
  const path = typeof username === "string" && /^[A-Za-z0-9_]+$/.test(username) ? username : chat.id.startsWith("-100") ? `c/${chat.id.slice(4)}` : undefined;
  return { title: chat.title, url: path ? `https://t.me/${path}/${messageId}` : undefined };
}
