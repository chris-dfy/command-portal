import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME_ID,
  getNexusTheme,
  isNexusThemeId,
  NEXUS_FORCED_COLOR_PALETTE,
  NEXUS_HIGH_CONTRAST_COLORS,
  resolveNexusColorScheme,
  resolveNexusTheme,
  type NexusColorMode,
  type NexusColorScheme,
  type NexusTheme,
  type NexusThemeColors,
  type NexusThemeId,
} from "./themes";

export type AppearanceSettings = {
  theme: NexusThemeId;
  colorMode: NexusColorMode;
  accentColor: string;
  glowIntensity: number;
  motionIntensity: number;
  transparency: number;
  compactMode: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  iconSize: number;
  iconOpacity: number;
  iconDock: "left" | "right";
  backgroundStyle: "field" | "grid" | "quiet";
  panelDensity: "comfortable" | "compact";
  showProofBadges: boolean;
  autoMinimizeChat: boolean;
  logoMode: "official_logo" | "holographic_logo" | "minimal_mark" | "orb_fallback";
};

export type SystemAppearance = {
  prefersDark: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  forcedColors: boolean;
};

export type ResolvedAppearance = {
  theme: NexusTheme;
  colorScheme: NexusColorScheme;
  colors: NexusThemeColors;
  accentColor: string;
  reducedMotion: boolean;
  highContrast: boolean;
  forcedColors: boolean;
};

export const APPEARANCE_STORAGE_KEY = "nexus.command.appearance.v2";

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: DEFAULT_THEME_ID,
  colorMode: DEFAULT_COLOR_MODE,
  accentColor: "#86f5d5",
  glowIntensity: 34,
  motionIntensity: 56,
  transparency: 18,
  compactMode: false,
  reducedMotion: false,
  highContrast: false,
  iconSize: 204,
  iconOpacity: 96,
  iconDock: "left",
  backgroundStyle: "field",
  panelDensity: "comfortable",
  showProofBadges: true,
  autoMinimizeChat: false,
  logoMode: "holographic_logo",
};

const SYSTEM_QUERIES = {
  dark: "(prefers-color-scheme: dark)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
  highContrast: "(prefers-contrast: more)",
  forcedColors: "(forced-colors: active)",
} as const;

const COLOR_MODES: readonly NexusColorMode[] = ["dark", "light", "system"];
const BACKGROUND_STYLES: readonly AppearanceSettings["backgroundStyle"][] = ["field", "grid", "quiet"];
const LOGO_MODES: readonly AppearanceSettings["logoMode"][] = [
  "official_logo",
  "holographic_logo",
  "minimal_mark",
  "orb_fallback",
];

const numberIn = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

const isColorMode = (value: unknown): value is NexusColorMode =>
  typeof value === "string" && COLOR_MODES.includes(value as NexusColorMode);

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function mediaMatches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function validateAppearanceSettings(value: unknown): AppearanceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_APPEARANCE };
  const candidate = value as Partial<AppearanceSettings>;
  const theme = isNexusThemeId(candidate.theme) ? candidate.theme : DEFAULT_APPEARANCE.theme;
  const defaultAccent = getNexusTheme(theme).colors.accent;
  const accentColor = isHexColor(candidate.accentColor)
    ? (theme === "nexus-noir" && candidate.accentColor.toLowerCase() === "#62d2ff" ? defaultAccent : candidate.accentColor)
    : defaultAccent;
  const colorMode = isColorMode(candidate.colorMode) ? candidate.colorMode : getNexusTheme(theme).colorScheme;

  return {
    theme,
    colorMode,
    accentColor,
    glowIntensity: numberIn(candidate.glowIntensity, 0, 100, DEFAULT_APPEARANCE.glowIntensity),
    motionIntensity: numberIn(candidate.motionIntensity, 0, 100, DEFAULT_APPEARANCE.motionIntensity),
    transparency: numberIn(candidate.transparency, 0, 55, DEFAULT_APPEARANCE.transparency),
    compactMode: candidate.compactMode === true,
    reducedMotion: candidate.reducedMotion === true,
    highContrast: candidate.highContrast === true,
    iconSize: numberIn(candidate.iconSize, 120, 260, DEFAULT_APPEARANCE.iconSize),
    iconOpacity: numberIn(candidate.iconOpacity, 35, 100, DEFAULT_APPEARANCE.iconOpacity),
    iconDock: candidate.iconDock === "right" ? "right" : "left",
    backgroundStyle: BACKGROUND_STYLES.includes(candidate.backgroundStyle as AppearanceSettings["backgroundStyle"])
      ? (candidate.backgroundStyle as AppearanceSettings["backgroundStyle"])
      : DEFAULT_APPEARANCE.backgroundStyle,
    panelDensity: candidate.panelDensity === "compact" ? "compact" : "comfortable",
    showProofBadges: candidate.showProofBadges !== false,
    autoMinimizeChat: candidate.autoMinimizeChat === true,
    logoMode: LOGO_MODES.includes(candidate.logoMode as AppearanceSettings["logoMode"])
      ? (candidate.logoMode as AppearanceSettings["logoMode"])
      : DEFAULT_APPEARANCE.logoMode,
  };
}

export function readAppearanceSettings(storage: Storage | null = browserStorage()): AppearanceSettings {
  if (!storage) return { ...DEFAULT_APPEARANCE };
  try {
    return validateAppearanceSettings(JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function persistAppearanceSettings(
  settings: AppearanceSettings,
  storage: Storage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function readSystemAppearance(): SystemAppearance {
  return {
    prefersDark: mediaMatches(SYSTEM_QUERIES.dark),
    prefersReducedMotion: mediaMatches(SYSTEM_QUERIES.reducedMotion),
    prefersHighContrast: mediaMatches(SYSTEM_QUERIES.highContrast),
    forcedColors: mediaMatches(SYSTEM_QUERIES.forcedColors),
  };
}

export function resolveAppearance(
  settings: AppearanceSettings,
  systemAppearance: SystemAppearance,
): ResolvedAppearance {
  const colorScheme = resolveNexusColorScheme(settings.colorMode, systemAppearance.prefersDark);
  const theme = resolveNexusTheme(settings.theme, settings.colorMode, systemAppearance.prefersDark);
  const forcedColors = systemAppearance.forcedColors;
  const highContrast = settings.highContrast || systemAppearance.prefersHighContrast || forcedColors;
  const colors = forcedColors
    ? NEXUS_FORCED_COLOR_PALETTE
    : highContrast
      ? NEXUS_HIGH_CONTRAST_COLORS[colorScheme]
      : theme.colors;

  return {
    theme,
    colorScheme,
    colors,
    accentColor: highContrast ? colors.accent : settings.accentColor,
    reducedMotion: settings.reducedMotion || systemAppearance.prefersReducedMotion,
    highContrast,
    forcedColors,
  };
}

export function applyAppearanceSettings(
  settings: AppearanceSettings,
  systemAppearance: SystemAppearance = readSystemAppearance(),
  suppliedRoot?: HTMLElement,
): ResolvedAppearance {
  const resolved = resolveAppearance(settings, systemAppearance);
  const root = suppliedRoot ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!root) return resolved;

  root.dataset.nexusTheme = resolved.theme.id;
  root.dataset.nexusThemePreference = settings.theme;
  root.dataset.nexusColorMode = settings.colorMode;
  root.dataset.nexusColorScheme = resolved.colorScheme;
  root.dataset.nexusMotion = resolved.reducedMotion ? "reduced" : "full";
  root.dataset.nexusDensity = settings.panelDensity;
  root.dataset.nexusBackground = settings.backgroundStyle;
  root.dataset.nexusContrast = resolved.highContrast ? "high" : "standard";
  root.dataset.nexusForcedColors = resolved.forcedColors ? "active" : "inactive";
  root.dataset.nexusCompact = settings.compactMode ? "true" : "false";
  root.dataset.nexusIconDock = settings.iconDock;
  root.dataset.nexusLogo = settings.logoMode;
  root.style.colorScheme = resolved.colorScheme;

  const variables: Record<string, string> = {
    "--nexus-accent": resolved.accentColor,
    "--nexus-accent-rgb": hexToRgb(resolved.accentColor),
    "--nexus-background": resolved.colors.background,
    "--nexus-panel": resolved.colors.panel,
    "--nexus-text": resolved.colors.text,
    "--nexus-muted": resolved.colors.muted,
    "--nexus-panel-border": resolved.colors.border,
    "--nexus-glow-strength": String(settings.glowIntensity / 100),
    "--nexus-motion-speed": resolved.reducedMotion ? "0" : String(Math.max(0.2, settings.motionIntensity / 55)),
    "--nexus-panel-opacity": resolved.highContrast ? "1" : String(1 - settings.transparency / 100),
    "--nexus-icon-size": `${settings.iconSize}px`,
    "--nexus-icon-opacity": String(settings.iconOpacity / 100),
    "--nx-canvas": resolved.colors.background,
    "--nx-canvas-subtle": `color-mix(in srgb, ${resolved.colors.background} 92%, ${resolved.colors.text})`,
    "--nx-surface-1": resolved.colors.panel,
    "--nx-surface-2": `color-mix(in srgb, ${resolved.colors.panel} 91%, ${resolved.colors.text})`,
    "--nx-surface-3": `color-mix(in srgb, ${resolved.colors.panel} 84%, ${resolved.colors.text})`,
    "--nx-surface-4": `color-mix(in srgb, ${resolved.colors.panel} 77%, ${resolved.colors.text})`,
    "--nx-surface-glass": resolved.colors.panel,
    "--nx-surface-overlay": `color-mix(in srgb, ${resolved.colors.background} 97%, ${resolved.colors.text})`,
    "--nx-surface-inset": `color-mix(in srgb, ${resolved.colors.background} 86%, transparent)`,
    "--nx-text-strong": resolved.colors.text,
    "--nx-text": resolved.colors.text,
    "--nx-text-muted": resolved.colors.muted,
    "--nx-text-subtle": `color-mix(in srgb, ${resolved.colors.muted} 76%, transparent)`,
    "--nx-text-inverse": resolved.colors.background,
    "--nx-border-subtle": `color-mix(in srgb, ${resolved.colors.border} 68%, transparent)`,
    "--nx-border": resolved.colors.border,
    "--nx-border-strong": `color-mix(in srgb, ${resolved.accentColor} 54%, transparent)`,
    "--nx-accent": resolved.accentColor,
    "--nx-accent-rgb": hexToRgb(resolved.accentColor),
    "--nx-accent-hover": `color-mix(in srgb, ${resolved.accentColor} 82%, ${resolved.colors.text})`,
    "--nx-accent-pressed": `color-mix(in srgb, ${resolved.accentColor} 82%, ${resolved.colors.background})`,
    "--nx-accent-soft": `color-mix(in srgb, ${resolved.accentColor} 10%, transparent)`,
    "--nx-accent-softer": `color-mix(in srgb, ${resolved.accentColor} 5%, transparent)`,
    "--nx-grid-line": `color-mix(in srgb, ${resolved.colors.text} 4%, transparent)`,
    "--accent": resolved.accentColor,
    "--accent-rgb": hexToRgb(resolved.accentColor),
    "--bg": resolved.colors.background,
    "--panel": resolved.colors.panel,
    "--text": resolved.colors.text,
    "--muted": resolved.colors.muted,
    "--border": resolved.colors.border,
    "--border-strong": resolved.colors.border,
  };
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
  return resolved;
}

function subscribeToMediaQuery(mediaQuery: MediaQueryList, listener: () => void): () => void {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }
  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

export function useAppearanceSettings() {
  const [settings, setSettingsState] = useState<AppearanceSettings>(readAppearanceSettings);
  const [systemAppearance, setSystemAppearance] = useState<SystemAppearance>(readSystemAppearance);
  const resolved = useMemo(() => resolveAppearance(settings, systemAppearance), [settings, systemAppearance]);

  const updateSettings = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettingsState((current) => {
      const adjustedPatch = { ...patch };
      if (patch.theme && patch.theme !== current.theme) {
        const currentTheme = getNexusTheme(current.theme);
        const nextTheme = getNexusTheme(patch.theme);
        if (patch.accentColor === undefined && current.accentColor.toLowerCase() === currentTheme.colors.accent.toLowerCase()) {
          adjustedPatch.accentColor = nextTheme.colors.accent;
        }
        if (patch.colorMode === undefined) adjustedPatch.colorMode = nextTheme.colorScheme;
      }
      return validateAppearanceSettings({ ...current, ...adjustedPatch });
    });
  }, []);

  const resetSettings = useCallback(() => setSettingsState({ ...DEFAULT_APPEARANCE }), []);
  const importSettings = useCallback((json: string) => {
    const next = validateAppearanceSettings(JSON.parse(json));
    setSettingsState(next);
    return next;
  }, []);
  const exportSettings = useCallback(() => JSON.stringify(settings, null, 2), [settings]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQueries = Object.values(SYSTEM_QUERIES).map((query) => window.matchMedia(query));
    const syncSystemAppearance = () => setSystemAppearance(readSystemAppearance());
    const unsubscribe = mediaQueries.map((mediaQuery) => subscribeToMediaQuery(mediaQuery, syncSystemAppearance));
    const syncStoredSettings = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      if (event.newValue === null) {
        setSettingsState({ ...DEFAULT_APPEARANCE });
        return;
      }
      try {
        setSettingsState(validateAppearanceSettings(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed writes from another tab and preserve the last valid local settings.
      }
    };
    window.addEventListener("storage", syncStoredSettings);
    return () => {
      unsubscribe.forEach((removeListener) => removeListener());
      window.removeEventListener("storage", syncStoredSettings);
    };
  }, []);

  useEffect(() => {
    persistAppearanceSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyAppearanceSettings(settings, systemAppearance);
  }, [settings, systemAppearance]);

  return {
    settings,
    systemAppearance,
    resolved,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
  };
}

function hexToRgb(color: string): string {
  if (!isHexColor(color)) return "0, 102, 204";
  const value = Number.parseInt(color.slice(1), 16);
  return `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
}
