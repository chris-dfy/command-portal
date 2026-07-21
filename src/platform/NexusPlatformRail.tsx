import { ChevronRight, Search, X, type LucideIcon } from "lucide-react";
import { NexusStatus } from "../design-system/NexusPrimitives";

export type PlatformRailItem = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  live?: boolean;
};

export type PlatformRailGroup = {
  label: string;
  items: PlatformRailItem[];
};

type NexusTone = "neutral" | "info" | "success" | "attention" | "critical";

export function NexusPlatformRail({
  groups,
  active,
  open,
  query,
  connectionLabel,
  connectionTone,
  onQueryChange,
  onNavigate,
  onClose,
}: {
  groups: PlatformRailGroup[];
  active: string;
  open: boolean;
  query: string;
  connectionLabel: string;
  connectionTone: NexusTone;
  onQueryChange: (query: string) => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      id="platform-navigation"
      className={`nx-platform-rail${open ? " is-open" : ""}`}
      aria-label="NEXUS platform navigation"
    >
      <header>
        <div>
          <span>Hosted NEXUS</span>
          <strong>Experience Gateway workspace</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close navigation"><X aria-hidden="true" /></button>
      </header>

      <label className="nx-platform-rail__search" htmlFor="platform-search">
        <Search aria-hidden="true" />
        <input
          id="platform-search"
          aria-label="Search platform workspaces"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Find a workspace"
        />
      </label>

      <nav>
        {visibleGroups.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={active === item.id}
                  aria-current={active === item.id ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                  title={item.detail}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.live && <i>Live</i>}
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </section>
        ))}
        {visibleGroups.length === 0 && <p className="nx-platform-rail__empty">No workspace matches “{query}”.</p>}
      </nav>

      <footer>
        <NexusStatus tone={connectionTone}>{connectionLabel}</NexusStatus>
        <small>No Runtime credential is stored in the browser. Mission and Knowledge state remain governed.</small>
      </footer>
    </aside>
  );
}
