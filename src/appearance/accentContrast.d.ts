export const MINIMUM_ACCENT_CONTRAST: number;

export function accentContrastRatio(foreground: string, background: string): number;

export function resolveAccessibleAccent(
  preferred: string,
  themeAccent: string,
  background: string,
  text: string,
): string;
