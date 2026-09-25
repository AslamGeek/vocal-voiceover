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
function fillScript() {
  fireEvent.change(screen.getByLabelText(/Your script/), { target: { value: "Hello, world." } });
}
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
