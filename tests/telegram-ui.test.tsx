// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TelegramSettings } from "@/components/telegram-settings";
import { TelegramSave } from "@/components/telegram-save";
import { connectTelegram, findTelegramGroups, loadTelegram, sendTelegramWav, storeTelegram } from "@/lib/telegram";
vi.mock("@/lib/telegram", async (original) => ({ ...await original<typeof import("@/lib/telegram")>(), connectTelegram: vi.fn(), findTelegramGroups: vi.fn(), sendTelegramWav: vi.fn() }));
const connection = { token: "123:dummy", chatId: "-1001234", title: "My voiceovers", topicId: "" };
beforeEach(() => { localStorage.clear(); vi.mocked(connectTelegram).mockReset(); vi.mocked(findTelegramGroups).mockReset(); vi.mocked(sendTelegramWav).mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("finds the group, saves connection details across remounts, and removes them", async () => {
  vi.mocked(findTelegramGroups).mockResolvedValue([{ id: connection.chatId, title: connection.title }]);
  vi.mocked(connectTelegram).mockResolvedValue(connection);
  let view = render(<TelegramSettings />);
  fireEvent.change(screen.getByLabelText("Telegram bot token"), { target: { value: connection.token } });
  fireEvent.click(screen.getByRole("button", { name: "Find groups" }));
  fireEvent.change(await screen.findByLabelText("Found groups"), { target: { value: connection.chatId } });
  fireEvent.click(screen.getByRole("button", { name: "Connect & save" }));
  await screen.findByText(/Connection saved/); expect(loadTelegram()).toEqual(connection);
  view.unmount(); view = render(<TelegramSettings />);
  expect((screen.getByLabelText("Telegram bot token") as HTMLInputElement).value).toBe(connection.token);
  fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
  expect(loadTelegram()).toBeNull();
});
it("retains the previous connection when saving browser storage fails", async () => {
  storeTelegram(connection); vi.mocked(connectTelegram).mockResolvedValue({ ...connection, chatId: "-1005678" });
  render(<TelegramSettings />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  fireEvent.click(screen.getByRole("button", { name: "Connect & save" }));
  await screen.findByRole("alert"); expect(loadTelegram()).toEqual(connection);
  expect(screen.queryByText(/Connection saved/)).toBeNull();
});
it("opens setup for an unconnected group without sending anything", async () => {
  const onSetup = vi.fn(); render(<TelegramSave url="blob:voice" filename="voice.wav" label="Sulafat" onSetup={onSetup} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Sulafat to Telegram" }));
  expect(onSetup).toHaveBeenCalledTimes(1); expect(sendTelegramWav).not.toHaveBeenCalled();
});
it("uploads only on click, prevents double sends and shows a verified success link", async () => {
  storeTelegram(connection);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["wav"]) }));
  let finish!: (result: { title: string; url?: string }) => void;
  vi.mocked(sendTelegramWav).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<TelegramSave url="blob:voice" filename="sample_Sulafat.wav" label="Sulafat" />);
  expect(sendTelegramWav).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Save Sulafat to Telegram" });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  expect(sendTelegramWav).toHaveBeenCalledTimes(1);
  expect(vi.mocked(sendTelegramWav).mock.calls[0][2]).toBe("sample_Sulafat.wav");
  await act(async () => finish({ title: connection.title, url: "https://t.me/c/1234/5" }));
  expect(screen.getByRole("link", { name: "Open in Telegram" }).getAttribute("href")).toBe("https://t.me/c/1234/5");
  expect(button.hasAttribute("disabled")).toBe(true);
});
it("aborts cancellation and ignores a late upload result", async () => {
  storeTelegram(connection);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["wav"]) }));
  let finish!: (result: { title: string }) => void;
  vi.mocked(sendTelegramWav).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<TelegramSave url="blob:voice" filename="voice.wav" label="Sulafat" />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Sulafat to Telegram" })));
  fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
  expect(vi.mocked(sendTelegramWav).mock.calls[0][3].aborted).toBe(true);
  await act(async () => finish({ title: connection.title }));
  expect(screen.queryByText("Saved to Telegram")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Check Telegram");
});
