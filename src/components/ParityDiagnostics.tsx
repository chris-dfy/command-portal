import { useEffect, useState } from "react";
import { Activity, FileCheck2, Mic2, ShieldCheck, Waypoints } from "lucide-react";
import { localNexusClient } from "../lib/local-client";
import { displayLabel } from "../lib/presentation";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type RuntimeRecord = Record<string, unknown>;

function asRecord(value: unknown): RuntimeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RuntimeRecord
    : {};
}

function recordsFrom(value: RuntimeRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return (value[key] as unknown[]).map(asRecord);
    }
  }
  return [];
}

function recordState(value: RuntimeRecord) {
  for (const key of ["displayStatus", "status", "state", "classification"]) {
    if (typeof value[key] === "string" && value[key]) return String(value[key]);
  }
  if (value.ready === true || value.available === true) return "available";
  if (value.ready === false || value.available === false) return "degraded";
  return "unknown";
}

function useRuntimeDiagnostic(loader: () => Promise<RuntimeRecord>) {
  const [value, setValue] = useState<RuntimeRecord | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loader()
      .then((next) => {
        if (active) {
          setValue(next);
          setError("");
        }
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => { active = false; };
  }, [loader]);
  return { value, error };
}

function DiagnosticBoundary({ error }: { error: string }) {
  return error
    ? <p className="boundary-note" role="alert">{error} This diagnostic fails closed and does not grant Authority.</p>
    : null;
}

export function MissionRuntimeEvidence() {
  const { value, error } = useRuntimeDiagnostic(localNexusClient.missions);
  const missions = recordsFrom(value ?? {}, ["missions", "items", "history"]);
  return <DataPanel eyebrow="Runtime Mission evidence" title="Recorded Mission identities and lineage" icon={<Waypoints size={18} />}>
    <DiagnosticBoundary error={error} />
    {missions.length ? <div className="evidence-list">{missions.map((mission, index) => {
      const missionId = String(mission.missionId ?? mission.id ?? `mission-${index + 1}`);
      return <article key={missionId}><div><strong>{displayLabel(missionId)}</strong><small>{String(mission.objective ?? mission.name ?? "Runtime-owned Mission record")}</small></div><StatusPill value={recordState(mission)} /></article>;
    })}</div> : <EmptyRecord />}
  </DataPanel>;
}

export function RuntimeMissionInventory() {
  const { value, error } = useRuntimeDiagnostic(localNexusClient.missions);
  const missions = recordsFrom(value ?? {}, ["missions", "items", "history"]);
  return <DataPanel eyebrow="Mission Control" title="Runtime Mission inventory" icon={<FileCheck2 size={18} />}>
    <DiagnosticBoundary error={error} />
    <div className="metric-row"><span>Recorded Missions</span><strong>{missions.length}</strong></div>
    {missions.slice(0, 6).map((mission, index) => <div className="metric-row" key={String(mission.missionId ?? mission.id ?? index)}><span>{String(mission.missionId ?? mission.id ?? "Runtime Mission")}</span><StatusPill value={recordState(mission)} /></div>)}
  </DataPanel>;
}

export function FunctionalReadinessDiagnostics({ readiness }: { readiness: RuntimeRecord | null }) {
  const capabilities = recordsFrom(readiness ?? {}, ["capabilities"]);
  return <DataPanel eyebrow="Functional readiness" title="Capability evidence, not promotion" icon={<Activity size={18} />}>
    {capabilities.length ? <div className="evidence-list">{capabilities.slice(0, 12).map((capability, index) => {
      const id = String(capability.capabilityId ?? capability.id ?? `capability-${index + 1}`);
      return <article key={id}><div><strong>{displayLabel(id)}</strong><small>{String(capability.reason ?? capability.requiredNextAction ?? "Runtime readiness evidence")}</small></div><StatusPill value={recordState(capability)} /></article>;
    })}</div> : <EmptyRecord />}
  </DataPanel>;
}

function ReadinessDiagnostic({
  title,
  loader,
}: {
  title: string;
  loader: () => Promise<RuntimeRecord>;
}) {
  const { value, error } = useRuntimeDiagnostic(loader);
  return <DataPanel eyebrow="Governance diagnostics" title={title} icon={<ShieldCheck size={18} />}>
    <DiagnosticBoundary error={error} />
    {value ? <>
      <StatusPill value={recordState(value)} />
      <p className="boundary-note">{String(value.reason ?? value.requiredNextAction ?? "Runtime readiness diagnostics are read-only.")}</p>
      <small>Availability never grants policy, Approval, or Authority.</small>
    </> : <EmptyRecord />}
  </DataPanel>;
}

export function GovernanceReadinessDiagnostics() {
  return <ReadinessDiagnostic title="Governance readiness" loader={localNexusClient.governanceReadiness} />;
}

export function AuthorityReadinessDiagnostics() {
  return <ReadinessDiagnostic title="Authority readiness" loader={localNexusClient.authorityReadiness} />;
}

export function VoiceRuntimeStatus() {
  const { value, error } = useRuntimeDiagnostic(localNexusClient.voiceStatus);
  return <DataPanel eyebrow="Voice Runtime status" title="Provider and transport posture" icon={<Mic2 size={18} />}>
    <DiagnosticBoundary error={error} />
    {value ? <>
      <StatusPill value={recordState(value)} />
      <p className="boundary-note">{String(value.reason ?? value.message ?? "Voice Runtime status is read-only; availability does not grant Approval or Authority.")}</p>
    </> : <EmptyRecord />}
  </DataPanel>;
}
