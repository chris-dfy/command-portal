import { BookOpen, Database, Layers } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import type { RuntimeSnapshot } from "../lib/types";

const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function KnowledgeWorkspace({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const capabilities = asRecord(snapshot.capabilities?.data);
  const missionStore = asRecord(capabilities?.missionStore) ?? asRecord(capabilities?.mission_store);
  const knowledgeStore = asRecord(capabilities?.knowledgeStore) ?? asRecord(capabilities?.knowledge_store);

  return <div className="experience-grid knowledge-split">
    <DataPanel eyebrow="Temporary working knowledge" title="Mission Store" icon={<Layers size={18} />}>
      <p className="stage-description">Bounded, mission-scoped working knowledge. Entries here are temporary and expire with their mission.</p>
      {missionStore ? <div className="replay-event-detail">
          {Object.entries(missionStore).slice(0, 10).map(([key, value]) => <div className="replay-event-field" key={key}>
            <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>)}
        </div>
      : <EmptyRecord>Runtime did not supply Mission Store state. Working knowledge is unavailable.</EmptyRecord>}
    </DataPanel>
    <DataPanel eyebrow="Permanent verified knowledge" title="Knowledge Store" icon={<Database size={18} />}>
      <p className="stage-description">Durable knowledge promoted only with Runtime-verified evidence. The browser cannot promote entries.</p>
      {knowledgeStore ? <div className="replay-event-detail">
          {Object.entries(knowledgeStore).slice(0, 10).map(([key, value]) => <div className="replay-event-field" key={key}>
            <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>)}
        </div>
      : <EmptyRecord>Runtime did not supply Knowledge Store state. Verified knowledge is unavailable.</EmptyRecord>}
    </DataPanel>
    <DataPanel eyebrow="Separation boundary" title="Promotion policy" icon={<BookOpen size={18} />} className="span-2">
      <p className="boundary-note">The Mission Store and Knowledge Store are strictly separated. Promotion from temporary to permanent knowledge happens only inside NEXUS Runtime with verified evidence — never in this portal.</p>
    </DataPanel>
  </div>;
}
