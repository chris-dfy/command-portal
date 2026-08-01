import type { NexusColorMode } from "./themes";

export const COLOR_MODE_STORAGE_KEY: "nexus.command.color-mode.v1";
export const LEGACY_APPEARANCE_STORAGE_KEYS: readonly string[];
export function isColorModePreference(value: unknown): value is NexusColorMode;
export function readColorModePreference(storage: Storage | null, fallback?: NexusColorMode): NexusColorMode;
export function persistColorModePreference(colorMode: NexusColorMode, storage: Storage | null): boolean;
