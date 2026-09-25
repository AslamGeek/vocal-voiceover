import { afterEach, expect, it, vi } from "vitest";
import { connectTelegram, findTelegramGroups, sendTelegramWav, TELEGRAM_MAX_BYTES } from "@/lib/telegram";
import { joinWavSections, pcmToWav } from "@/lib/audio";
const connection = { token: "123456:dummy_test_token", chatId: "-1001234", topicId: "", title: "Voiceovers" };
const chat = { id: -1001234, type: "supergroup", title: "Voiceovers" };
const audio = () => new Blob([pcmToWav(new Uint8Array([1, 0, 2, 0]))], { type: "audio/wav" });
const ok = (result: unknown) => Response.json({ ok: true, result });
afterEach(() => vi.unstubAllGlobals());
it("connects and resolves a group without sending a message", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(ok({ is_bot: true })).mockResolvedValueOnce(ok(chat));
  vi.stubGlobal("fetch", fetchMock);
  expect(await connectTelegram(connection.token, "@mygroup", "42")).toEqual({ ...connection, topicId: "42" });
  expect(fetchMock.mock.calls.map(([url]) => url.split("/").at(-1))).toEqual(["getMe", "getChat"]);
  expect(fetchMock.mock.calls[1][1].body.get("chat_id")).toBe("@mygroup");
});
it("finds only groups without consuming updates or changing webhooks", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok([{ message: { chat, text: "private content" } }, { my_chat_member: { chat } }, { message: { chat: { id: 5, type: "private", title: "Private" } } }]));
  vi.stubGlobal("fetch", fetchMock);
  expect(await findTelegramGroups(connection.token)).toEqual([{ id: "-1001234", title: "Voiceovers" }]);
  expect(fetchMock.mock.calls[0][1].body.has("offset")).toBe(false);
  expect(fetchMock.mock.calls[0][1].body.has("allowed_updates")).toBe(false);
});
it("sends the exact joined WAV and filename directly to Telegram, including files above 4.5 MB", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok({ chat, message_id: 78, document: { file_id: "telegram-file" } }));
  vi.stubGlobal("fetch", fetchMock);
  const wav = joinWavSections([pcmToWav(new Uint8Array(2_400_000)), pcmToWav(new Uint8Array(2_400_000))]);
  const result = await sendTelegramWav({ ...connection, topicId: "42" }, wav, "నమస్కారం_Sulafat.wav", new AbortController().signal);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`https://api.telegram.org/bot${connection.token}/sendDocument`);
  expect(init.body.get("chat_id")).toBe(connection.chatId); expect(init.body.get("message_thread_id")).toBe("42");
  const uploaded: File = init.body.get("document");
  expect(uploaded.name).toBe("నమస్కారం_Sulafat.wav"); expect(uploaded.type).toBe("audio/wav");
  expect(Buffer.from(await uploaded.arrayBuffer()).equals(Buffer.from(await wav.arrayBuffer()))).toBe(true);
  expect(init.credentials).toBe("omit"); expect(init.redirect).toBe("error"); expect(init.referrerPolicy).toBe("no-referrer");
  expect(result).toEqual({ title: "Voiceovers", url: "https://t.me/c/1234/78" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([400, 401, 403, 409, 429, 500])("normalizes Telegram %s without token disclosure or automatic retries", async (status) => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: false, error_code: status, description: connection.token }, { status }));
  vi.stubGlobal("fetch", fetchMock);
  const error = await sendTelegramWav(connection, audio(), "voice.wav", new AbortController().signal).catch((cause: Error) => cause);
  expect(error).toBeInstanceOf(Error); expect(String(error)).not.toContain(connection.token);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("rejects invalid/oversized audio, unsafe tokens and cancellation before posting", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(sendTelegramWav(connection, new Blob(["broken"]), "voice.wav", new AbortController().signal)).rejects.toThrow("WAV");
  const tooBig = audio(); Object.defineProperty(tooBig, "size", { value: TELEGRAM_MAX_BYTES + 1 });
  await expect(sendTelegramWav(connection, tooBig, "voice.wav", new AbortController().signal)).rejects.toThrow("50 MB");
  await expect(connectTelegram("1:token/path", connection.chatId, "")).rejects.toThrow("BotFather");
  const controller = new AbortController(); controller.abort();
  await expect(sendTelegramWav(connection, audio(), "voice.wav", controller.signal)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("treats network loss as uncertain delivery and never retries the upload", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error(`sensitive ${connection.token}`)); vi.stubGlobal("fetch", fetchMock);
  await expect(sendTelegramWav(connection, audio(), "voice.wav", new AbortController().signal)).rejects.toThrow("Check your Telegram group");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
