export const MINIMUM_ACCENT_CONTRAST = 4.5;

const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function relativeLuminance(color) {
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

export function accentContrastRatio(foreground, background) {
  if (!isHexColor(foreground) || !isHexColor(background)) return 0;
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export function resolveAccessibleAccent(preferred, themeAccent, background, text) {
  for (const candidate of [preferred, themeAccent, text]) {
    if (isHexColor(candidate) && accentContrastRatio(candidate, background) >= MINIMUM_ACCENT_CONTRAST) {
      return candidate.toLowerCase();
    }
  }
  return text;
}
