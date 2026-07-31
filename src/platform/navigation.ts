import {
  NEXUS_EXECUTIVE_SURFACES,
  type NexusSurfaceId,
} from "./surfaceRegistry";

export type NexusPlatformAreaId = Extract<
  NexusSurfaceId,
  "dashboard" | "missions" | "replay" | "conclave" | "knowledge" | "edge" | "mission-control" | "settings"
>;

export const NEXUS_PLATFORM_PATHS: Readonly<Record<NexusPlatformAreaId, string>> = Object.freeze(
  Object.fromEntries(
    NEXUS_EXECUTIVE_SURFACES.map((surface) => [surface.id, surface.client.route]),
  ) as Record<NexusPlatformAreaId, string>,
);

export const NEXUS_PLATFORM_PATH_ALIASES: Readonly<Record<string, NexusPlatformAreaId>> = Object.freeze({
  "/replay": "replay",
  "/edge": "edge",
});

export const NEXUS_PLATFORM_NAVIGATION = Object.freeze(
  NEXUS_EXECUTIVE_SURFACES.map(({ id, label, detail }) => ({
    id: id as NexusPlatformAreaId,
    label,
    detail,
  })),
) satisfies ReadonlyArray<{ id: NexusPlatformAreaId; label: string; detail: string }>;
