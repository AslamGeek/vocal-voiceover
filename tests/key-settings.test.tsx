// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceoverStudio from "@/components/voiceover-studio";
import { addKeyLines, emptyKeys, loadBrowserKeys, updateBrowserKeys } from "@/lib/browser-keys";
import { requestVoiceover } from "@/lib/api-client";
vi.mock("@/lib/api-client", () => ({ requestVoiceover: vi.fn() }));
const requestMock = vi.mocked(requestVoiceover);
beforeEach(() => {
  localStorage.clear(); requestMock.mockReset(); requestMock.mockResolvedValue(new Blob(["wav"]));
  URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
async function studio() {
  const view = render(<VoiceoverStudio />);
  await waitFor(() => expect(screen.queryByText("Add an API key in Settings to preview or generate voices.") || !screen.getByRole("button", { name: "Preview Warm & Inviting Female (Sulafat)" }).hasAttribute("disabled")).toBeTruthy());
  return view;
}
function openSettings() { fireEvent.click(screen.getByRole("button", { name: "Settings" })); }
async function add(text: string) {
  for (const line of text.split("\n")) {
    const [label, value] = line.split("|").map((part) => part.trim());
    fireEvent.change(screen.getByLabelText(/New key label/), { target: { value: label } });
    fireEvent.change(screen.getByLabelText("New API key"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    await screen.findByText("Key saved in this browser.");
  }
}
it("stores many plain-text keys, deduplicates and migrates the old key without losing it", async () => {
  localStorage.setItem("vocal.gemini-api-key", "existing-key");
  const migrated = await loadBrowserKeys();
  expect(migrated.keys[0].value).toBe("existing-key");
  expect(migrated.activeId).toBe(migrated.keys[0].id);
  expect(localStorage.getItem("vocal.gemini-api-key")).toBeNull();
  const saved = await updateBrowserKeys((current) => addKeyLines(current, "existing-key\n" + Array.from({ length: 120 }, (_, i) => `Project ${i} | key-${i}`).join("\n")));
  expect(saved.keys).toHaveLength(121);
  expect(await loadBrowserKeys()).toEqual(saved);
  expect(localStorage.getItem("vocal.api-keys")).toContain("key-119");
});
it("does not lose the previous key or claim a save when storage is full", async () => {
  localStorage.setItem("vocal.gemini-api-key", "old-key");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
  await expect(loadBrowserKeys()).rejects.toThrow();
  expect(localStorage.getItem("vocal.gemini-api-key")).toBe("old-key");
});
it("rejects corrupted storage instead of overwriting it, and accepts keys without restrictive provider patterns", async () => {
  const valid = addKeyLines(emptyKeys(), "My key | key.with-dashes_and-punctuation");
  expect(valid.keys[0].value).toBe("key.with-dashes_and-punctuation");
  localStorage.setItem("vocal.api-keys", "not JSON");
  await expect(loadBrowserKeys()).rejects.toThrow();
  await expect(updateBrowserKeys(() => valid)).rejects.toThrow();
  expect(localStorage.getItem("vocal.api-keys")).toBe("not JSON");
});
it("adds, selects, remembers and deletes keys through Settings, then selects the remaining browser key", { timeout: 15000 }, async () => {
  let view = await studio(); openSettings();
  await add("Project A | secret-a\nProject B | secret-b");
  expect((screen.getByLabelText("New API key") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("API key for Project A") as HTMLInputElement).value).toBe("secret-a");
  expect((screen.getByLabelText("API key for Project B") as HTMLInputElement).value).toBe("secret-b");
  expect(screen.queryByText("Server key")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /Project B/ }));
  await screen.findByText("Using Project B.");
  fireEvent.click(screen.getByRole("button", { name: "Close Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview Warm & Inviting Female (Sulafat)" }));
  await waitFor(() => expect(requestMock.mock.calls[0]?.[3]).toBe("secret-b"));
  view.unmount(); view = await studio(); openSettings();
  expect((screen.getByRole("radio", { name: /Project B/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Delete Project B" }));
  await screen.findByText("Key deleted.");
  expect((await loadBrowserKeys()).keys.map((key) => key.value)).toEqual(["secret-a"]);
  fireEvent.click(screen.getByRole("button", { name: "Close Settings" }));
  fireEvent.change(screen.getByLabelText(/01 Transcript/), { target: { value: "Hello there." } });
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await screen.findByText("1 of 1 auditions ready");
  expect(requestMock.mock.calls.at(-1)?.[3]).toBe("secret-a");
  openSettings(); fireEvent.click(screen.getByRole("button", { name: "Delete Project A" }));
  await screen.findByText("Key deleted.");
  expect((await loadBrowserKeys()).activeId).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close Settings" }));
  expect(screen.getByRole("button", { name: "Generate" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Preview Warm & Inviting Female (Sulafat)" }).hasAttribute("disabled")).toBe(true);
});
it("clears preview cache on a key switch and locks Settings throughout a generation", async () => {
  await updateBrowserKeys((current) => addKeyLines(current, "A | key-a\nB | key-b"));
  await studio();
  fireEvent.click(screen.getByRole("button", { name: "Preview Warm & Inviting Female (Sulafat)" }));
  await screen.findByLabelText("Warm & Inviting Female (Sulafat) preview");
  openSettings(); fireEvent.click(screen.getByRole("radio", { name: "Use B" }));
  await screen.findByText("Using B.");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  fireEvent.click(screen.getByRole("button", { name: "Close Settings" }));
  let resolve!: (value: Blob) => void;
  requestMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  fireEvent.change(screen.getByLabelText(/01 Transcript/), { target: { value: "Hello there." } });
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  expect(requestMock.mock.calls.at(-1)?.[3]).toBe("key-b");
  expect(screen.getByRole("button", { name: "Settings" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Settings" }).hasAttribute("disabled")).toBe(false);
  await act(async () => resolve(new Blob(["cancelled"])));
});
it("reports failed saves while keeping the input and previous active key", async () => {
  await studio(); openSettings();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
  fireEvent.change(screen.getByLabelText("New API key"), { target: { value: "new-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Add key" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Key saved in this browser.")).toBeNull();
  expect((screen.getByLabelText("New API key") as HTMLInputElement).value).toBe("new-secret");
  expect(localStorage.getItem("vocal.api-keys")).toBeNull();
});
it("copies the full key and saves edits to the label and active value across reloads", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await updateBrowserKeys((current) => addKeyLines(current, "Project | initial-secret"));
  await studio(); openSettings();
  fireEvent.click(screen.getByRole("button", { name: "Copy Project" }));
  await screen.findByText("Project copied.");
  expect(writeText).toHaveBeenCalledWith("initial-secret");
  fireEvent.click(screen.getByRole("button", { name: "Edit Project" }));
  fireEvent.change(screen.getByLabelText("Key label"), { target: { value: "Renamed" } });
  fireEvent.change(screen.getByLabelText("API key for Project"), { target: { value: "updated-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Key updated.");
  const saved = await loadBrowserKeys();
  expect(saved.keys[0]).toMatchObject({ label: "Renamed", value: "updated-secret", id: saved.activeId });
  expect((screen.getByLabelText("API key for Renamed") as HTMLInputElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Copy Renamed" }));
  await screen.findByText("Renamed copied.");
  expect(writeText).toHaveBeenLastCalledWith("updated-secret");
  writeText.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copy Renamed" }));
  await screen.findByText(/Copy wasn’t allowed/);
});
