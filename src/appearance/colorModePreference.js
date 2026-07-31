export const COLOR_MODE_STORAGE_KEY = "nexus.command.color-mode.v1";
export const LEGACY_APPEARANCE_STORAGE_KEYS = Object.freeze([
  "nexus.command.appearance.v2",
  "nexus.command.appearance.v1",
]);

const COLOR_MODES = new Set(["dark", "light", "system"]);

export function isColorModePreference(value) {
  return typeof value === "string" && COLOR_MODES.has(value);
}

function parsedPreference(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (isColorModePreference(value)) return value;
    if (value && typeof value === "object" && isColorModePreference(value.colorMode)) {
      return value.colorMode;
    }
  } catch {
    return null;
  }
  return null;
}

export function readColorModePreference(storage, fallback = "system") {
  if (!storage) return fallback;
  try {
    const current = parsedPreference(storage.getItem(COLOR_MODE_STORAGE_KEY));
    if (current) return current;
    for (const key of LEGACY_APPEARANCE_STORAGE_KEYS) {
      const legacy = parsedPreference(storage.getItem(key));
      if (legacy) return legacy;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function persistColorModePreference(colorMode, storage) {
  if (!storage || !isColorModePreference(colorMode)) return false;
  try {
    storage.setItem(COLOR_MODE_STORAGE_KEY, JSON.stringify({ colorMode }));
    for (const key of LEGACY_APPEARANCE_STORAGE_KEYS) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
