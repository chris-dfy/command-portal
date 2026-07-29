import { useSyncExternalStore } from "react";
import { Activity, Menu, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import { NexusIconButton } from "../design-system/NexusPrimitives";
import { assistantPresence } from "../lib/assistant-presence";
import { NexusAvatar, NEXUS_AVATAR_STATE_LABELS } from "../components/NexusAvatar";
import "../components/NexusAvatar.css";

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
        <NexusAssistantLauncher copilotOpen={copilotOpen} onToggleCopilot={onToggleCopilot} />
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

/**
 * Assistant launcher: mirrors the copilot's truthful avatar state (voice,
 * text, mute, interruption, error) through the presentation-only presence
 * store. It owns no session, credential, or Runtime state.
 */
function NexusAssistantLauncher({ copilotOpen, onToggleCopilot }: { copilotOpen: boolean; onToggleCopilot: () => void }) {
  const presence = useSyncExternalStore(assistantPresence.subscribe, assistantPresence.get, assistantPresence.get);
  return (
    <NexusIconButton
      label={`${copilotOpen ? "Close" : "Open"} NEXUS interaction panel — ${NEXUS_AVATAR_STATE_LABELS[presence.state]}`}
      onClick={onToggleCopilot}
      aria-controls="nexus-copilot"
      aria-expanded={copilotOpen}
      className="nx-assistant-launcher"
    ><NexusAvatar state={presence.state} amplitude={presence.amplitude} size="xs" label="" /></NexusIconButton>
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
