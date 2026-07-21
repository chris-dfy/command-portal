export type NexusPlatformAreaId = "dashboard" | "missions" | "replay" | "conclave" | "knowledge" | "edge" | "mission-control" | "settings";

export const NEXUS_PLATFORM_NAVIGATION = [
  { id: "dashboard", label: "Dashboard", detail: "Executive operating posture" },
  { id: "missions", label: "Missions", detail: "Portfolio and executor" },
  { id: "replay", label: "Operational Replay", detail: "Timeline and stage inspection" },
  { id: "conclave", label: "Conclave", detail: "Challenge and synthesis" },
  { id: "knowledge", label: "Knowledge", detail: "Acquisition and promotion" },
  { id: "edge", label: "Edge Runtime", detail: "Topology and boundaries" },
  { id: "mission-control", label: "Mission Control", detail: "Governed operational execution" },
  { id: "settings", label: "Settings", detail: "Runtime and experience posture" },
] as const satisfies ReadonlyArray<{ id: NexusPlatformAreaId; label: string; detail: string }>;
