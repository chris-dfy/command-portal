import { Activity, Menu, PanelRightClose, PanelRightOpen, RefreshCw, Sparkles } from "lucide-react";
import { NexusIconButton } from "../design-system/NexusPrimitives";

export function NexusWorkspaceCommandBar({
  activeLabel,
  loading,
  navigationOpen,
  copilotOpen,
  inspectorOpen,
  onOpenNavigation,
  onRefresh,
  onToggleCopilot,
  onToggleInspector,
}: {
  activeLabel: string;
  loading: boolean;
  navigationOpen: boolean;
  copilotOpen: boolean;
  inspectorOpen: boolean;
  onOpenNavigation: () => void;
  onRefresh: () => void;
  onToggleCopilot: () => void;
  onToggleInspector: () => void;
}) {
  return (
    <header className="nx-workspace-commandbar">
      <div>
        <NexusIconButton
          label="Open navigation"
          onClick={onOpenNavigation}
          aria-controls="platform-navigation"
          aria-expanded={navigationOpen}
        ><Menu aria-hidden="true" /></NexusIconButton>
        <span>Hosted NEXUS</span>
        <i aria-hidden="true">/</i>
        <strong>{activeLabel}</strong>
      </div>
      <div>
        <NexusIconButton label="Refresh Runtime signals" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
        </NexusIconButton>
        <NexusIconButton
          label={copilotOpen ? "Close NEXUS interaction panel" : "Open NEXUS interaction panel"}
          onClick={onToggleCopilot}
          aria-expanded={copilotOpen}
        ><Sparkles aria-hidden="true" /></NexusIconButton>
        <NexusIconButton
          label={inspectorOpen ? "Close context inspector" : "Open context inspector"}
          onClick={onToggleInspector}
          aria-controls="context-inspector"
          aria-expanded={inspectorOpen}
        >{inspectorOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}</NexusIconButton>
      </div>
    </header>
  );
}

export function NexusActivityStream({ message, timestamp }: { message: string; timestamp: string }) {
  return (
    <footer className="nx-platform-activity">
      <span><Activity aria-hidden="true" />Operational activity</span>
      <p>{message}</p>
      <time>{timestamp}</time>
    </footer>
  );
}
