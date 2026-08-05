import { ArrowRight, Bot, Files, FolderKanban, Mic2, Route, Waypoints } from "lucide-react";
import { DataPanel } from "./DataPanel";

type CommandDestination = "missions" | "projects" | "documents" | "voice" | "work-sessions";

const destinations: Array<{
  id: CommandDestination;
  label: string;
  detail: string;
  icon: typeof Waypoints;
}> = [
  { id: "missions", label: "Missions", detail: "Plan and inspect governed Mission work.", icon: Waypoints },
  { id: "projects", label: "Projects", detail: "Create, load, and compile evidence-backed project artifacts.", icon: FolderKanban },
  { id: "documents", label: "Documents", detail: "Ingest and query tenant-bound source Evidence.", icon: Files },
  { id: "voice", label: "Voice", detail: "Use typed or bounded browser-speech continuity; full-duplex Realtime is quarantined.", icon: Mic2 },
  { id: "work-sessions", label: "Work Sessions", detail: "Plan and control supported bounded-session actions.", icon: Route },
];

export function HostedCommandDirectory({
  onAsk,
  onNavigate,
}: {
  onAsk: () => void;
  onNavigate: (destination: CommandDestination) => void;
}) {
  return <DataPanel eyebrow="Hosted Command Center" title="Governed command directory" icon={<Bot size={18} />} className="span-2">
    <p className="boundary-note">This module is a read-only directory. It never treats navigation, authentication, or aggregate health as Authority; every destination admits its own exact action.</p>
    <div className="hosted-command-directory">
      <button type="button" onClick={onAsk}><Bot size={17} /><span><strong>Ask NEXUS</strong><small>Open the governed Copilot conversation.</small></span><ArrowRight size={15} /></button>
      {destinations.map((destination) => {
        const Icon = destination.icon;
        return <button type="button" key={destination.id} onClick={() => onNavigate(destination.id)}><Icon size={17} /><span><strong>{destination.label}</strong><small>{destination.detail}</small></span><ArrowRight size={15} /></button>;
      })}
    </div>
  </DataPanel>;
}
