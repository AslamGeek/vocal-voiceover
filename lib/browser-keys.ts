export type SavedKey = { id: string; label: string; value: string };
export type BrowserKeys = { activeId: string | null; keys: SavedKey[] };
const STORAGE = "vocal.api-keys";
const LEGACY_KEY = "vocal.gemini-api-key";
export const emptyKeys = (): BrowserKeys => ({ activeId: null, keys: [] });
export function removeSavedKey(current: BrowserKeys, id: string): BrowserKeys {
  const keys = current.keys.filter((key) => key.id !== id);
  return { keys, activeId: current.activeId === id ? keys[0]?.id ?? null : current.activeId };
}
function validateKey(label: string, value: string) {
  if (!value || value.length > 8192 || /[\s\x00-\x1f\x7f]/.test(value) || !label || label.length > 80)
    throw new Error("Enter a key without spaces and a label of up to 80 characters.");
}
export function addSavedKey(current: BrowserKeys, label: string, value: string): BrowserKeys {
  label = label.trim() || `Key ${current.keys.length + 1}`;
  value = value.trim(); validateKey(label, value);
  if (current.keys.some((key) => key.value === value)) throw new Error("That API key is already saved.");
  const key = { id: crypto.randomUUID(), label, value };
  return { keys: [...current.keys, key], activeId: current.keys.length ? current.activeId : key.id };
}
export function editSavedKey(current: BrowserKeys, id: string, label: string, value: string): BrowserKeys {
  label = label.trim(); value = value.trim(); validateKey(label, value);
  if (!current.keys.some((key) => key.id === id)) throw new Error("This key was removed in another tab. Reopen Settings.");
  if (current.keys.some((key) => key.id !== id && key.value === value)) throw new Error("That API key is already saved.");
  return { ...current, keys: current.keys.map((key) => key.id === id ? { ...key, label, value } : key) };
}
function read(): BrowserKeys {
  const raw = localStorage.getItem(STORAGE);
  if (raw === null) return emptyKeys();
  const value = JSON.parse(raw) as BrowserKeys;
  if (!value || !Array.isArray(value.keys) || !value.keys.every((key) => key && typeof key.id === "string" && typeof key.label === "string" && typeof key.value === "string")
    || (value.activeId !== null && !value.keys.some((key) => key.id === value.activeId)))
    throw new Error("Saved keys could not be read. Check this browser’s site storage.");
  // Upgrade a previous Server key selection to the first saved browser key.
  return { ...value, activeId: value.activeId ?? value.keys[0]?.id ?? null };
}
export function addKeyLines(current: BrowserKeys, text: string): BrowserKeys {
  const keys = [...current.keys];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("Enter at least one API key.");
  for (const line of lines) {
    const separator = line.indexOf("|");
    const value = (separator < 0 ? line : line.slice(separator + 1)).trim();
    const label = separator < 0 ? "Key " + (keys.length + 1) : line.slice(0, separator).trim();
    validateKey(label, value);
    if (!keys.some((key) => key.value === value)) keys.push({ id: crypto.randomUUID(), label, value });
  }
  return { keys, activeId: current.keys.length ? current.activeId : keys[0]?.id ?? null };
}
export async function updateBrowserKeys(update: (current: BrowserKeys) => BrowserKeys): Promise<BrowserKeys> {
  const next = update(read());
  // Do not report success or change the active in-memory key if saving fails.
  localStorage.setItem(STORAGE, JSON.stringify(next));
  return next;
}
export async function loadBrowserKeys(): Promise<BrowserKeys> {
  const legacy = localStorage.getItem(LEGACY_KEY)?.trim();
  if (legacy) {
    const migrated = await updateBrowserKeys((current) => current.keys.some((key) => key.value === legacy) ? current : addKeyLines(current, "Imported key | " + legacy));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  }
  return read();
}
