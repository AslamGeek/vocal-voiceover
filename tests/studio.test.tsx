// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceoverStudio from "@/components/voiceover-studio";
import { requestVoiceover } from "@/lib/api-client";
import { VOICE_PROFILES, VOICE_VARIANTS, getVoiceVariant, variantLabel, type VoiceVariantId } from "@/lib/voice-profiles";
vi.mock("@/lib/api-client", () => ({ requestVoiceover: vi.fn() }));
vi.mock("@/components/use-browser-keys", () => ({ useBrowserKeys: () => ({ saved: { activeId: null, keys: [] }, apiKey: "ui-test-key", ready: true, error: "", reload: vi.fn(), change: vi.fn(), useServer: vi.fn() }) }));
const requestMock = vi.mocked(requestVoiceover);
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  requestMock.mockReset();
  let id = 0;
  URL.createObjectURL = vi.fn(() => `blob:voice-${++id}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(cleanup);
const label = (id: VoiceVariantId) => variantLabel(getVoiceVariant(id)!);
const checkbox = (id: VoiceVariantId) => screen.getByRole("checkbox", { name: label(id) }) as HTMLInputElement;
const directionField = (id: VoiceVariantId) => screen.getByLabelText(`${getVoiceVariant(id)!.voice} direction`) as HTMLTextAreaElement;
const download = (id: VoiceVariantId) => screen.getByRole("link", { name: `Download ${label(id)} WAV` });
const previewButton = (id: VoiceVariantId) => screen.getByRole("button", { name: `Preview ${label(id)}` });
const resultPlayer = (id: VoiceVariantId) => screen.getByLabelText(`${label(id)} voiceover`);
const fill = (text = "  నమస్కారం! Hello, world.\n", direction = "Conversational Andhra Telugu, medium pace.") => {
  fireEvent.change(screen.getByLabelText(/01 Transcript/), { target: { value: text } });
  fireEvent.change(directionField("warm-female"), { target: { value: direction } });
};
const generate = () => fireEvent.click(screen.getByRole("button", { name: "Generate" }));
function pendingRequests() {
  const pending = new Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>();
  requestMock.mockImplementation((input) => new Promise((resolve, reject) => pending.set(input.variantId, { resolve, reject })));
  return pending;
}

it("shows exactly five profiles with ten independent variants and a warm female default", () => {
  render(<VoiceoverStudio />);
  expect(VOICE_PROFILES).toHaveLength(5);
  expect(screen.getAllByRole("group")).toHaveLength(5);
  expect(screen.getAllByRole("checkbox")).toHaveLength(11);
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(10);
  expect(checkbox("warm-female").checked).toBe(true);
  expect(screen.getAllByRole("checkbox").filter((element) => (element as HTMLInputElement).checked)).toHaveLength(1);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  for (const variant of VOICE_VARIANTS) expect(directionField(variant.id).value).toBe(variant.profile.baseDirection);
  fill(); fireEvent.click(checkbox("warm-female"));
  expect(screen.getByRole("button", { name: "Generate" }).hasAttribute("disabled")).toBe(true);
  fireEvent.submit(screen.getByRole("button", { name: "Generate" }).closest("form")!);
  expect(screen.getByRole("alert").textContent).toContain("at least one");
  expect(requestMock).not.toHaveBeenCalled();
});

it("keeps API key fields out of the studio and provides Settings", () => {
  render(<VoiceoverStudio />);
  expect(screen.queryByLabelText("Gemini API key")).toBeNull();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
});

it("uses one result path for one voice, locks duplicate submissions, and preserves filenames after edits", async () => {
  const pending = pendingRequests(); render(<VoiceoverStudio />); fill("Hello, world.", "");
  const form = screen.getByRole("button", { name: "Generate" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(requestMock).toHaveBeenCalledTimes(1);
  expect(requestMock.mock.calls[0][0]).toEqual({ text: "Hello, world.", direction: "", variantId: "warm-female" });
  expect(checkbox("warm-male").closest("fieldset")?.disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Select all voices" }) as HTMLInputElement).disabled).toBe(true);
  expect(directionField("warm-female").closest("fieldset")?.disabled).toBe(true);
  await act(async () => pending.get("warm-female")!.resolve(new Blob(["wav"])));
  expect(resultPlayer("warm-female").getAttribute("src")).toBe("blob:voice-1");
  const filename = download("warm-female").getAttribute("download");
  expect(filename).toMatch(/^Hello-world_\d{4}-\d{2}-\d{2}_\d{6}_Sulafat\.wav$/);
  fill("New transcript", "Different direction"); fireEvent.click(checkbox("firm-male"));
  expect(download("warm-female").getAttribute("download")).toBe(filename);
});

it("keeps each voice direction through selection changes and resets only that voice", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"])); render(<VoiceoverStudio />); fill();
  fireEvent.change(directionField("warm-male"), { target: { value: "Quiet, slow English." } });
  fireEvent.click(checkbox("warm-male")); fireEvent.click(checkbox("warm-male"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all voices" }));
  expect(directionField("warm-male").value).toBe("Quiet, slow English.");
  fireEvent.click(screen.getByRole("button", { name: "Clear Achird direction" }));
  expect(directionField("warm-male").value).toBe("");
  expect(document.activeElement).toBe(directionField("warm-male"));
  expect(screen.queryByRole("button", { name: "Clear Achird direction" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reset Achird direction" }));
  expect(directionField("warm-male").value).toBe(getVoiceVariant("warm-male")!.profile.baseDirection);
  expect(directionField("warm-female").value).toBe("Conversational Andhra Telugu, medium pace.");
  generate(); await screen.findByText("10 of 10 auditions ready");
  expect(requestMock.mock.calls.find(([input]) => input.variantId === "warm-male")![0].direction).toBe(getVoiceVariant("warm-male")!.profile.baseDirection);
});

it("refreshes previews after direction edits without reusing stale audio", async () => {
  requestMock.mockResolvedValue(new Blob(["preview"])); render(<VoiceoverStudio />);
  fireEvent.click(previewButton("warm-female")); await screen.findByLabelText(`${label("warm-female")} preview`);
  fireEvent.change(directionField("warm-female"), { target: { value: "Crisp and energetic." } });
  expect(screen.queryByLabelText("Voice preview")).toBeNull();
  fireEvent.click(previewButton("warm-female")); await screen.findByLabelText(`${label("warm-female")} preview`);
  expect(requestMock.mock.calls[1][0].direction).toBe("Crisp and energetic.");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-1");
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  fireEvent.click(previewButton("warm-female"));
  expect(requestMock).toHaveBeenCalledTimes(2);
});

it("cancels an in-flight preview when its direction changes and ignores its late audio", async () => {
  const pending = pendingRequests(); render(<VoiceoverStudio />);
  fireEvent.click(previewButton("warm-female"));
  fireEvent.change(directionField("warm-female"), { target: { value: "New delivery." } });
  expect(requestMock.mock.calls[0][1].aborted).toBe(true);
  await act(async () => pending.get("warm-female")!.resolve(new Blob(["old audio"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Voice preview")).toBeNull();
});

it("generates four voices including both genders with at most two requests and preserves partial success", async () => {
  const pending = pendingRequests(); render(<VoiceoverStudio />); fill();
  for (const id of ["warm-male", "firm-female", "premium-male"] as const) {
    fireEvent.click(checkbox(id));
    fireEvent.change(directionField(id), { target: { value: `Custom direction for ${id}` } });
  }
  generate();
  expect(requestMock.mock.calls.map(([input]) => input.variantId)).toEqual(["warm-female", "warm-male"]);
  expect(screen.getAllByText("Queued")).toHaveLength(2);
  await act(async () => pending.get("warm-female")!.resolve(new Blob(["wav"])));
  expect(requestMock.mock.calls[2][0].variantId).toBe("firm-female");
  await act(async () => pending.get("warm-male")!.reject(new Error("Service is busy.")));
  expect(requestMock.mock.calls[3][0].variantId).toBe("premium-male");
  expect(download("warm-female")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("Service is busy.");
  await act(async () => {
    pending.get("firm-female")!.resolve(new Blob(["wav"]));
    pending.get("premium-male")!.resolve(new Blob(["wav"]));
  });
  expect(screen.getByText("3 of 4 auditions ready")).toBeTruthy();
  for (const [input] of requestMock.mock.calls) expect(input).toMatchObject({ text: "  నమస్కారం! Hello, world.\n", direction: input.variantId === "warm-female" ? "Conversational Andhra Telugu, medium pace." : `Custom direction for ${input.variantId}` });
  expect(screen.getAllByRole("link", { name: /^Download / })).toHaveLength(3);
});

it("allows all ten variants and continues the bounded queue", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"])); render(<VoiceoverStudio />); fill();
  const selectAll = screen.getByRole("checkbox", { name: "Select all voices" }) as HTMLInputElement;
  expect(selectAll.indeterminate).toBe(true);
  fireEvent.click(selectAll);
  expect(VOICE_VARIANTS.every((variant) => checkbox(variant.id).checked)).toBe(true);
  fireEvent.click(selectAll);
  expect(VOICE_VARIANTS.every((variant) => !checkbox(variant.id).checked)).toBe(true);
  expect(screen.getByRole("button", { name: "Generate" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(selectAll);
  generate();
  await screen.findByText("10 of 10 auditions ready");
  expect(requestMock).toHaveBeenCalledTimes(10);
  expect(screen.getAllByRole("link", { name: /^Download / })).toHaveLength(10);
});

it("cancels running and queued voices, preserves successes, and ignores late completions", async () => {
  const pending = pendingRequests(); render(<VoiceoverStudio />); fill();
  for (const id of ["warm-male", "firm-female", "firm-male"] as const) fireEvent.click(checkbox(id));
  generate();
  await act(async () => pending.get("warm-female")!.resolve(new Blob(["wav"])));
  const cancelled = requestMock.mock.calls.map(([, signal]) => signal);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancelled.every((signal) => signal.aborted)).toBe(true);
  expect(screen.getAllByText("Cancelled")).toHaveLength(3);
  expect(download("warm-female")).toBeTruthy();
  await act(async () => {
    pending.get("warm-male")!.resolve(new Blob(["late"]));
    pending.get("firm-female")!.resolve(new Blob(["late"]));
  });
  expect(requestMock).toHaveBeenCalledTimes(3);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  requestMock.mockResolvedValue(new Blob(["new"])); generate();
  await screen.findByText("4 of 4 auditions ready");
});

it("shows long-script progress and aborts on unmount without storing late audio", async () => {
  let resolve!: (blob: Blob) => void;
  requestMock.mockImplementation((_input, _signal, progress) => {
    progress?.({ completed: 1, total: 30 });
    return new Promise((done) => { resolve = done; });
  });
  const view = render(<VoiceoverStudio />); fill(); generate();
  expect(screen.getByText("1 of 30 sections complete")).toBeTruthy();
  view.unmount();
  expect(requestMock.mock.calls[0][1].aborted).toBe(true);
  await act(async () => resolve(new Blob(["late"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("retains transcript/direction limits and clears only the transcript with keyboard focus", () => {
  render(<VoiceoverStudio />); fill("పదం ".repeat(3000), "Keep this direction.");
  const field = screen.getByLabelText(/01 Transcript/) as HTMLTextAreaElement;
  expect(screen.getByText("3,000 / 3,000 words")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Generate" }).hasAttribute("disabled")).toBe(false);
  fireEvent.change(field, { target: { value: field.value + "extra" } });
  expect(screen.getByRole("alert").textContent).toContain("3,000");
  expect(screen.getByRole("button", { name: "Generate" }).hasAttribute("disabled")).toBe(true);
  expect(directionField("warm-female").getAttribute("maxlength")).toBe("1000");
  fireEvent.click(screen.getByRole("button", { name: "Clear transcript" }));
  expect(field.value).toBe(""); expect(document.activeElement).toBe(field);
  expect((directionField("warm-female") as HTMLTextAreaElement).value).toBe("Keep this direction.");
  expect(checkbox("warm-female").checked).toBe(true);
});

it.each(VOICE_VARIANTS)("lazily previews $id, caches it, and leaves the editor and results untouched", async (variant) => {
  requestMock.mockResolvedValue(new Blob(["preview"])); render(<VoiceoverStudio />); fill();
  const before = screen.getAllByRole("checkbox").map((element) => (element as HTMLInputElement).checked);
  fireEvent.click(previewButton(variant.id));
  await screen.findByLabelText(`${label(variant.id)} preview`);
  expect(requestMock.mock.calls[0][0]).toEqual({ text: variant.profile.previewScript, direction: directionField(variant.id).value, variantId: variant.id });
  expect((screen.getByLabelText(/01 Transcript/) as HTMLTextAreaElement).value).toBe("  నమస్కారం! Hello, world.\n");
  expect((directionField("warm-female") as HTMLTextAreaElement).value).toBe("Conversational Andhra Telugu, medium pace.");
  expect(screen.getAllByRole("checkbox").map((element) => (element as HTMLInputElement).checked)).toEqual(before);
  expect(screen.queryByRole("link", { name: /^Download / })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  fireEvent.click(previewButton(variant.id));
  await screen.findByLabelText(`${label(variant.id)} preview`);
  expect(requestMock).toHaveBeenCalledTimes(1);
});

it("deduplicates previews and cancels a superseded preview without stale results", async () => {
  const pending = pendingRequests(); render(<VoiceoverStudio />);
  fireEvent.click(previewButton("warm-male")); fireEvent.click(previewButton("warm-male"));
  expect(requestMock).toHaveBeenCalledTimes(1);
  fireEvent.click(previewButton("firm-female"));
  expect(requestMock.mock.calls[0][1].aborted).toBe(true);
  await act(async () => pending.get("warm-male")!.resolve(new Blob(["stale"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => pending.get("firm-female")!.resolve(new Blob(["preview"])));
  expect(screen.getByLabelText(`${label("firm-female")} preview`)).toBeTruthy();
});

it("cancels pending preview work when generation starts or the studio unmounts", async () => {
  const pending = pendingRequests(); const view = render(<VoiceoverStudio />); fill();
  fireEvent.click(previewButton("premium-male")); generate();
  expect(requestMock.mock.calls[0][1].aborted).toBe(true);
  expect(screen.queryByLabelText("Voice preview")).toBeNull();
  view.unmount();
  expect(requestMock.mock.calls[1][1].aborted).toBe(true);
  await act(async () => {
    pending.get("premium-male")!.resolve(new Blob(["stale"]));
    pending.get("warm-female")!.resolve(new Blob(["stale"]));
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("recovers from preview generation/playback errors without creating an audition", async () => {
  requestMock.mockRejectedValueOnce(new Error("Service is busy.")).mockResolvedValue(new Blob(["preview"]));
  render(<VoiceoverStudio />);
  fireEvent.click(previewButton("calm-female"));
  expect((await screen.findByRole("alert")).textContent).toBe("Service is busy.");
  fireEvent.click(previewButton("calm-female"));
  fireEvent.error(await screen.findByLabelText(`${label("calm-female")} preview`));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-1");
  expect(screen.getByRole("alert").textContent).toContain("couldn’t be played");
  fireEvent.click(previewButton("calm-female"));
  await screen.findByLabelText(`${label("calm-female")} preview`);
  expect(requestMock).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("link", { name: /^Download / })).toBeNull();
});

it("pauses other preview/result audio in both directions and keeps failed playback downloadable", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"])); render(<VoiceoverStudio />); fill();
  fireEvent.click(checkbox("firm-male")); generate(); await screen.findByText("2 of 2 auditions ready");
  fireEvent.click(previewButton("calm-male"));
  const preview = await screen.findByLabelText(`${label("calm-male")} preview`);
  const pause = vi.mocked(HTMLMediaElement.prototype.pause); pause.mockClear();
  fireEvent.play(preview);
  expect(pause.mock.instances).toContain(resultPlayer("warm-female"));
  expect(pause.mock.instances).toContain(resultPlayer("firm-male"));
  pause.mockClear(); fireEvent.play(resultPlayer("warm-female"));
  expect(pause.mock.instances).toContain(preview);
  expect(pause.mock.instances).toContain(resultPlayer("firm-male"));
  fireEvent.error(resultPlayer("warm-female"));
  expect(screen.getByRole("alert").textContent).toContain("couldn’t be played");
  expect(download("warm-female")).toBeTruthy();
});

it("releases replaced results and all session preview URLs on unmount", async () => {
  requestMock.mockResolvedValue(new Blob(["wav"])); const view = render(<VoiceoverStudio />); fill();
  fireEvent.click(previewButton("warm-female")); await screen.findByLabelText(`${label("warm-female")} preview`);
  fireEvent.click(previewButton("warm-male")); await screen.findByLabelText(`${label("warm-male")} preview`);
  generate(); await screen.findByText("1 of 1 auditions ready");
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  generate(); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(4));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-3");
  view.unmount();
  expect(new Set(vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url))).toEqual(new Set(["blob:voice-1", "blob:voice-2", "blob:voice-3", "blob:voice-4"]));
});
