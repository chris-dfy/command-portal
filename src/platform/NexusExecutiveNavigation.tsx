import { Search, type LucideIcon } from "lucide-react";
import { NexusStatus } from "../design-system/NexusPrimitives";
import nexusSymbol from "../assets/nexus-symbol.svg";

export type ExecutiveNavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type NexusTone = "neutral" | "info" | "success" | "attention" | "critical";

export function NexusExecutiveNavigation({
  items,
  active,
  connectionLabel,
  connectionTone,
  alertCount,
  onNavigate,
  onSearch,
}: {
  items: ExecutiveNavigationItem[];
  active: string;
  connectionLabel: string;
  connectionTone: NexusTone;
  alertCount: number;
  onNavigate: (id: string) => void;
  onSearch: () => void;
}) {
  return (
    <header className="nx-executive-nav">
      <button
        className="nx-executive-nav__brand"
        type="button"
        onClick={() => onNavigate("dashboard")}
        aria-label="NEXUS dashboard"
      >
        <span className="nx-executive-nav__mark" aria-hidden="true"><img src={nexusSymbol} alt="" /></span>
        <span>
          <strong>NEXUS</strong>
          <small>Executive Operating System</small>
        </span>
      </button>

      <nav aria-label="Executive navigation">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              data-active={active === item.id}
              aria-current={active === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="nx-executive-nav__tools">
        <button
          type="button"
          className="nx-global-search"
          onClick={onSearch}
          aria-label="Search platform workspaces"
        >
          <Search aria-hidden="true" />
          <span>Search or command</span>
          <kbd>⌘ K</kbd>
        </button>
        <NexusStatus tone={connectionTone} pulse={connectionTone === "success"}>{connectionLabel}</NexusStatus>
        {alertCount > 0 && <NexusStatus tone="attention">{alertCount} signal{alertCount === 1 ? "" : "s"}</NexusStatus>}
      </div>
    </header>
  );
}
