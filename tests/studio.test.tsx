// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceoverStudio from "@/components/voiceover-studio";
import { requestVoiceover } from "@/lib/api-client";
vi.mock("@/lib/api-client", () => ({ requestVoiceover: vi.fn() }));
const requestMock = vi.mocked(requestVoiceover);
beforeEach(() => {
  requestMock.mockReset();
  URL.createObjectURL = vi.fn().mockReturnValue("blob:voice-1");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

it("defaults to single voice and requires at least two comparison voices", () => {
  render(<VoiceoverStudio />); fillScript();
  expect((screen.getByRole("radio", { name: "Single voice" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Kore/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Puck/ }));
  expect(screen.getByRole("button", { name: "Generate auditions" }).hasAttribute("disabled")).toBe(true);
  fireEvent.submit(screen.getByRole("button", { name: "Generate auditions" }).closest("form")!);
  expect(requestMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("at least two");
});
it("compares the identical input, prevents duplicate batches, and retains partial success", async () => {
  const pending: Record<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }> = {};
  requestMock.mockImplementation((input) => new Promise((resolve, reject) => { pending[input.voice] = { resolve, reject }; }));
  render(<VoiceoverStudio />); fillScript();
  fireEvent.change(screen.getByLabelText(/Delivery direction/), { target: { value: "Warm and relaxed." } });
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  const form = screen.getByRole("button", { name: "Generate auditions" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(requestMock).toHaveBeenCalledTimes(3);
  expect(requestMock.mock.calls.map(([input]) => input)).toEqual([
    { text: "Hello, world.", persona: "Warm and relaxed.", voice: "Kore" },
    { text: "Hello, world.", persona: "Warm and relaxed.", voice: "Puck" },
    { text: "Hello, world.", persona: "Warm and relaxed.", voice: "Sulafat" },
  ]);
  await act(async () => { pending.Kore.resolve(new Blob(["wav"])); pending.Puck.reject(new Error("Service is busy.")); });
  expect(screen.getByRole("link", { name: "Download Kore WAV" }).getAttribute("download")).toBe("voiceover-kore.wav");
  expect(screen.getByRole("alert").textContent).toContain("Puck: Service is busy.");
  expect(screen.getByRole("button", { name: "Generating auditions…" }).hasAttribute("disabled")).toBe(true);
  await act(async () => pending.Sulafat.resolve(new Blob(["wav"])));
  expect(screen.getByRole("status").textContent).toBe("2 of 3 auditions ready");
  expect(screen.getByRole("button", { name: "Generate auditions" }).hasAttribute("disabled")).toBe(false);
});
it("generates only selected comparison voices and pauses the other player", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"]));
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Puck/ }));
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  await screen.findByRole("link", { name: "Download Sulafat WAV" });
  expect(requestMock.mock.calls.map(([input]) => input.voice)).toEqual(["Kore", "Sulafat"]);
  const kore = screen.getByLabelText("Kore voiceover");
  const sulafat = screen.getByLabelText("Sulafat voiceover");
  fireEvent.play(kore);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(pause.mock.instances[0]).toBe(sulafat);
  fireEvent.error(kore);
  expect(screen.getByRole("alert").textContent).toContain("Kore: This audio");
});
it("releases all comparison URLs when replaced or unmounted", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"]));
  let id = 0;
  vi.mocked(URL.createObjectURL).mockImplementation(() => "blob:compare-" + ++id);
  const view = render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  await screen.findByRole("link", { name: "Download Sulafat WAV" });
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(6));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(6);
});
it("cancels every comparison request on unmount and ignores late results", async () => {
  const resolves: ((blob: Blob) => void)[] = [];
  requestMock.mockImplementation(() => new Promise((resolve) => { resolves.push(resolve); }));
  const view = render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  const signals = requestMock.mock.calls.map(([, signal]) => signal);
  view.unmount();
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  await act(async () => resolves.forEach((resolve) => resolve(new Blob(["wav"]))));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("returns to single generation after a comparison", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"]));
  render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  await screen.findByRole("link", { name: "Download Sulafat WAV" });
  fireEvent.click(screen.getByRole("radio", { name: "Single voice" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  await screen.findByLabelText("Generated voiceover");
  expect(requestMock).toHaveBeenCalledTimes(4);
  expect(requestMock.mock.calls[3][0].voice).toBe("Sulafat");
});
it("cancels pending comparison voices while retaining completed downloads", async () => {
  requestMock.mockImplementation((input, signal, progress) => {
    if (input.voice === "Kore") return Promise.resolve(new Blob(["wav"]));
    progress?.({ completed: 2, total: 30 });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  });
  render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("radio", { name: "Compare voices" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate auditions" }));
  await screen.findByRole("link", { name: "Download Kore WAV" });
  expect(screen.getAllByText("2 of 30 sections complete")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate auditions" }).hasAttribute("disabled")).toBe(false));
  expect(screen.getByRole("link", { name: "Download Kore WAV" })).toBeTruthy();
  expect(screen.getAllByRole("alert").every((element) => element.textContent?.includes("Generation cancelled."))).toBe(true);
});
function fillScript() {
  fireEvent.change(screen.getByLabelText(/Your script/), { target: { value: "Hello, world." } });
}
it("counts words, permits 3,000, and preserves over-limit text for editing", () => {
  render(<VoiceoverStudio />);
  const field = screen.getByLabelText(/Your script/) as HTMLTextAreaElement;
  const text = "పదం ".repeat(3000);
  fireEvent.change(field, { target: { value: text } });
  expect(screen.getByText("3,000 / 3,000 words")).toBeTruthy();
  expect(field.hasAttribute("maxlength")).toBe(false);
  expect(screen.getByRole("button", { name: "Generate voice" }).hasAttribute("disabled")).toBe(false);
  fireEvent.change(field, { target: { value: text + "extra" } });
  expect(field.value).toBe(text + "extra");
  expect(screen.getByRole("alert").textContent).toContain("3,000 words");
  expect(screen.getByRole("button", { name: "Generate voice" }).hasAttribute("disabled")).toBe(true);
});
it("shows section progress and lets users cancel a long generation", async () => {
  requestMock.mockImplementation((_input, signal, progress) => new Promise((_resolve, reject) => {
    progress?.({ completed: 1, total: 30 });
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  expect(screen.getByRole("status").textContent).toContain("1 of 30 sections complete");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate voice" }).hasAttribute("disabled")).toBe(false));
  expect(requestMock.mock.calls[0][1].aborted).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("starts with the warm voice and editable Andhra Telugu delivery direction", () => {
  render(<VoiceoverStudio />);
  expect((screen.getByLabelText("Voice") as HTMLSelectElement).value).toBe("Sulafat");
  expect((screen.getByLabelText(/Delivery direction/) as HTMLTextAreaElement).value).toContain("native Andhra Telugu accent");
  expect((screen.getByLabelText(/Your script/) as HTMLTextAreaElement).value).toBe("");
});
it("prevents duplicate submissions while generating and exposes the result", async () => {
  let resolve!: (blob: Blob) => void;
  requestMock.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<VoiceoverStudio />); fillScript();
  const button = screen.getByRole("button", { name: "Generate voice" });
  const form = button.closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(requestMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Generating voice…" }).hasAttribute("disabled")).toBe(true);
  await act(async () => resolve(new Blob(["wav"], { type: "audio/wav" })));
  expect(screen.getByLabelText("Generated voiceover").getAttribute("src")).toBe("blob:voice-1");
  expect(screen.getByRole("link", { name: /Download WAV/ }).getAttribute("download")).toBe("voiceover.wav");
  expect(screen.getByRole("button", { name: "Generate voice" }).hasAttribute("disabled")).toBe(false);
});
it("releases replaced and unmounted audio URLs", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"]));
  vi.mocked(URL.createObjectURL).mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  const view = render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  await screen.findByRole("link", { name: /Download WAV/ });
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first"));
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
});
it("shows a recoverable accessible error and keeps a previous result", async () => {
  requestMock.mockResolvedValueOnce(new Blob(["wav"])).mockRejectedValueOnce(new Error("The voice service is busy."));
  render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  await screen.findByRole("link", { name: /Download WAV/ });
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The voice service is busy.");
  expect(screen.getByRole("link", { name: /Download WAV/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Generate voice" }).hasAttribute("disabled")).toBe(false);
});
it("aborts an in-flight request on unmount", () => {
  requestMock.mockReturnValue(new Promise(() => {}));
  const view = render(<VoiceoverStudio />); fillScript();
  fireEvent.click(screen.getByRole("button", { name: "Generate voice" }));
  const signal = requestMock.mock.calls[0][1];
  view.unmount(); expect(signal.aborted).toBe(true);
});
