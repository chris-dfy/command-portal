import { useEffect, useState } from "react";
import { RefreshCw, Target } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const asList = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : null;
const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function MissionDashboard() {
  const [missions, setMissions] = useState<Record<string, unknown>[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/local/missions", { headers: { Accept: "application/json" } })
      .then((response) => response.json())
      .then((body) => {
        const supplied = asList(body?.data) ?? asList(asRecord(body?.data)?.missions);
        if (body?.ok && supplied) { setMissions(supplied); setUnavailable(false); }
        else { setMissions([]); setUnavailable(!body?.ok); }
      })
      .catch(() => { setMissions([]); setUnavailable(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  return <div className="experience-grid">
    <DataPanel eyebrow="Mission Dashboard" title="Runtime mission history" icon={<Target size={18} />} className="span-2">
      {loading ? <p className="replay-loading">Loading mission history from Runtime…</p>
        : unavailable ? <EmptyRecord>Runtime did not supply mission history. Mission status is unavailable.</EmptyRecord>
        : !missions?.length ? <EmptyRecord>No missions have been recorded by Runtime.</EmptyRecord>
        : <div className="mission-list">
            {missions.map((mission, index) => {
              const id = String(mission.id ?? mission.missionId ?? `mission-${index}`);
              return <article className="mission-card" key={id}>
                <header><strong>{String(mission.title ?? mission.objective ?? id)}</strong><StatusPill value={String(mission.status ?? "unknown")} /></header>
                <dl>
                  <div><dt>Mission ID</dt><dd>{id}</dd></div>
                  <div><dt>Created</dt><dd>{String(mission.createdAt ?? mission.created_at ?? "Not supplied by Runtime")}</dd></div>
                  <div><dt>Updated</dt><dd>{String(mission.updatedAt ?? mission.updated_at ?? "Not supplied by Runtime")}</dd></div>
                </dl>
              </article>;
            })}
          </div>}
      <button className="replay-refresh-list" onClick={load} disabled={loading}><RefreshCw size={13} /> Refresh missions</button>
      <p className="boundary-note">Mission definitions, status, and progression are owned by NEXUS Runtime. The browser renders only what Runtime supplies.</p>
    </DataPanel>
  </div>;
}
