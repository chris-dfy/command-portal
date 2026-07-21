import { useId, type CSSProperties } from "react";
import { NexusButton, NexusPanel, NexusStatus } from "../design-system/NexusPrimitives";
import { NEXUS_THEMES, type NexusColorMode, type NexusTheme } from "./themes";
import { useAppearanceSettings } from "./useAppearanceSettings";

const COLOR_MODES: ReadonlyArray<{
  id: NexusColorMode;
  label: string;
  description: string;
}> = [
  { id: "dark", label: "Dark", description: "Use a dark operational workspace." },
  { id: "light", label: "Light", description: "Use the accessible daylight workspace." },
  { id: "system", label: "System", description: "Follow this device's light or dark preference." },
];

type ThemePreviewStyle = CSSProperties & {
  "--appearance-theme-background": string;
  "--appearance-theme-panel": string;
  "--appearance-theme-text": string;
  "--appearance-theme-border": string;
  "--appearance-theme-accent": string;
};

function themePreviewStyle(theme: NexusTheme): ThemePreviewStyle {
  return {
    "--appearance-theme-background": theme.colors.background,
    "--appearance-theme-panel": theme.colors.panel,
    "--appearance-theme-text": theme.colors.text,
    "--appearance-theme-border": theme.colors.border,
    "--appearance-theme-accent": theme.colors.accent,
  };
}

export function AppearanceWorkspace({ appearance }: { appearance: ReturnType<typeof useAppearanceSettings> }) {
  const controlGroupId = useId();
  const { settings, systemAppearance, resolved, updateSettings, resetSettings } = appearance;
  const appearanceStatus = resolved.forcedColors
    ? "System forced colors"
    : `${resolved.colorScheme === "dark" ? "Dark" : "Light"} · ${resolved.highContrast ? "high contrast" : "standard contrast"}`;

  return (
    <NexusPanel
      className="appearance-workspace"
      eyebrow="Local presentation"
      title="Appearance"
      description="Personalize this browser without changing Runtime state, evidence, or authority."
      actions={(
        <NexusStatus tone="info" role="status" aria-live="polite">
          {appearanceStatus}
        </NexusStatus>
      )}
    >
      <div className="appearance-workspace__sections">
        <fieldset className="appearance-workspace__section appearance-workspace__themes">
          <legend>Theme</legend>
          <p id={`${controlGroupId}-theme-help`}>Choose the visual palette for the NEXUS Platform shell.</p>
          <div className="appearance-workspace__theme-options" aria-describedby={`${controlGroupId}-theme-help`}>
            {NEXUS_THEMES.map((theme) => {
              const inputId = `${controlGroupId}-theme-${theme.id}`;
              return (
                <label
                  className="appearance-workspace__theme-option"
                  data-selected={settings.theme === theme.id || undefined}
                  htmlFor={inputId}
                  key={theme.id}
                  style={themePreviewStyle(theme)}
                >
                  <input
                    id={inputId}
                    name={`${controlGroupId}-theme`}
                    type="radio"
                    value={theme.id}
                    checked={settings.theme === theme.id}
                    onChange={() => updateSettings({ theme: theme.id })}
                  />
                  <span className="appearance-workspace__theme-preview" aria-hidden="true">
                    <i />
                  </span>
                  <span className="appearance-workspace__theme-copy">
                    <strong>{theme.name}</strong>
                    <small>{theme.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="appearance-workspace__section appearance-workspace__color-mode">
          <legend>Color mode</legend>
          <div className="appearance-workspace__mode-options">
            {COLOR_MODES.map((mode) => {
              const inputId = `${controlGroupId}-mode-${mode.id}`;
              return (
                <label
                  className="appearance-workspace__mode-option"
                  data-selected={settings.colorMode === mode.id || undefined}
                  htmlFor={inputId}
                  key={mode.id}
                >
                  <input
                    id={inputId}
                    name={`${controlGroupId}-color-mode`}
                    type="radio"
                    value={mode.id}
                    checked={settings.colorMode === mode.id}
                    onChange={() => updateSettings({ colorMode: mode.id })}
                  />
                  <span>
                    <strong>{mode.label}</strong>
                    <small>{mode.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="appearance-workspace__section appearance-workspace__preferences">
          <legend>Accessibility and density</legend>
          <label className="appearance-workspace__preference">
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={(event) => updateSettings({ highContrast: event.currentTarget.checked })}
            />
            <span>
              <strong>High contrast</strong>
              <small>
                Strengthen text and control boundaries. System contrast and forced-color preferences remain authoritative.
              </small>
            </span>
          </label>
          <label className="appearance-workspace__preference">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => updateSettings({ reducedMotion: event.currentTarget.checked })}
            />
            <span>
              <strong>Reduce motion</strong>
              <small>Minimize interface animation. This device's reduced-motion preference is always honored.</small>
            </span>
          </label>
          <label className="appearance-workspace__preference">
            <input
              type="checkbox"
              checked={settings.compactMode}
              onChange={(event) => {
                const compactMode = event.currentTarget.checked;
                updateSettings({ compactMode, panelDensity: compactMode ? "compact" : "comfortable" });
              }}
            />
            <span>
              <strong>Compact layout</strong>
              <small>Reduce navigation and panel spacing for higher information density.</small>
            </span>
          </label>
        </fieldset>
      </div>

      <footer className="appearance-workspace__footer">
        <NexusButton variant="ghost" size="sm" onClick={resetSettings}>
          Restore defaults
        </NexusButton>
        <NexusStatus tone="neutral">Presentation only</NexusStatus>
        {(systemAppearance.prefersHighContrast || systemAppearance.prefersReducedMotion || systemAppearance.forcedColors) && (
          <small role="status">
            Active operating-system accessibility preferences are applied automatically.
          </small>
        )}
      </footer>
    </NexusPanel>
  );
}
