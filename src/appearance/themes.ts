export type NexusThemeId =
  | "nexus-noir"
  | "executive-glass"
  | "tactical-blue"
  | "government-command"
  | "minimal-light"
  | "ambient-hologram";

export type NexusColorMode = "dark" | "light" | "system";
export type NexusColorScheme = Exclude<NexusColorMode, "system">;

export type NexusThemeColors = {
  background: string;
  panel: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
};

export type NexusTheme = {
  id: NexusThemeId;
  name: string;
  description: string;
  colorScheme: NexusColorScheme;
  colors: NexusThemeColors;
};

export const NEXUS_THEMES: readonly NexusTheme[] = [
  {
    id: "nexus-noir",
    name: "NEXUS Noir",
    description: "Nexicron charcoal with restrained mint intelligence light.",
    colorScheme: "dark",
    colors: {
      background: "#1e1e1e",
      panel: "rgba(35, 36, 35, .94)",
      text: "#f4f0e9",
      muted: "#a7aaa6",
      border: "rgba(244, 240, 233, .15)",
      accent: "#86f5d5",
    },
  },
  {
    id: "executive-glass",
    name: "Executive Glass",
    description: "Quiet translucent surfaces for executive briefings.",
    colorScheme: "dark",
    colors: {
      background: "#202120",
      panel: "rgba(45, 47, 45, .78)",
      text: "#f8f5ef",
      muted: "#b5b7b2",
      border: "rgba(244, 240, 233, .18)",
      accent: "#a4f5dc",
    },
  },
  {
    id: "tactical-blue",
    name: "Tactical Blue",
    description: "High-information blue command environment.",
    colorScheme: "dark",
    colors: {
      background: "#03101e",
      panel: "rgba(5, 26, 46, .86)",
      text: "#e9f7ff",
      muted: "#87a9c2",
      border: "rgba(44, 153, 237, .28)",
      accent: "#299cf0",
    },
  },
  {
    id: "government-command",
    name: "Government Command",
    description: "Restrained slate and amber authority cues.",
    colorScheme: "dark",
    colors: {
      background: "#0b0e10",
      panel: "rgba(25, 29, 30, .9)",
      text: "#f3f0e9",
      muted: "#b2ada1",
      border: "rgba(202, 172, 92, .24)",
      accent: "#c9aa58",
    },
  },
  {
    id: "minimal-light",
    name: "Minimal Light",
    description: "Accessible daylight workspace with low visual noise.",
    colorScheme: "light",
    colors: {
      background: "#f4f0e9",
      panel: "rgba(255, 253, 248, .94)",
      text: "#1e1e1e",
      muted: "#626762",
      border: "rgba(30, 30, 30, .18)",
      accent: "#0e8167",
    },
  },
  {
    id: "ambient-hologram",
    name: "Ambient Hologram",
    description: "Atmospheric teal and violet intelligence field.",
    colorScheme: "dark",
    colors: {
      background: "#050711",
      panel: "rgba(10, 18, 35, .78)",
      text: "#f0f5ff",
      muted: "#9caac8",
      border: "rgba(107, 235, 223, .22)",
      accent: "#6bebdf",
    },
  },
];

export const NEXUS_HIGH_CONTRAST_COLORS: Readonly<Record<NexusColorScheme, NexusThemeColors>> = {
  dark: {
    background: "#000000",
    panel: "#050505",
    text: "#ffffff",
    muted: "#d6e5ee",
    border: "#ffffff",
    accent: "#78dcff",
  },
  light: {
    background: "#ffffff",
    panel: "#ffffff",
    text: "#000000",
    muted: "#24313a",
    border: "#000000",
    accent: "#005a7a",
  },
};

export const NEXUS_FORCED_COLOR_PALETTE: NexusThemeColors = {
  background: "Canvas",
  panel: "Canvas",
  text: "CanvasText",
  muted: "GrayText",
  border: "CanvasText",
  accent: "LinkText",
};

export const DEFAULT_THEME_ID: NexusThemeId = "nexus-noir";
export const DEFAULT_COLOR_MODE: NexusColorMode = "dark";

export function isNexusThemeId(value: unknown): value is NexusThemeId {
  return typeof value === "string" && NEXUS_THEMES.some((theme) => theme.id === value);
}

export function getNexusTheme(id: NexusThemeId): NexusTheme {
  return NEXUS_THEMES.find((theme) => theme.id === id) ?? NEXUS_THEMES[0];
}

export function resolveNexusColorScheme(mode: NexusColorMode, prefersDark: boolean): NexusColorScheme {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

export function resolveNexusTheme(
  themeId: NexusThemeId,
  mode: NexusColorMode,
  prefersDark: boolean,
): NexusTheme {
  const requested = getNexusTheme(themeId);
  const scheme = resolveNexusColorScheme(mode, prefersDark);
  if (requested.colorScheme === scheme) return requested;
  return getNexusTheme(scheme === "light" ? "minimal-light" : DEFAULT_THEME_ID);
}
