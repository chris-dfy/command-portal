import { useId, type ReactNode } from "react";

export function DataPanel({ eyebrow, title, icon, children, className = "" }: { eyebrow?: string; title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  const titleId = useId();
  return <section className={`data-panel nx-panel ${className}`.trim()} data-nexus-primitive="panel" aria-labelledby={titleId}>
    <header className="nx-panel__header">
      <div>{eyebrow && <span className="nx-eyebrow">{eyebrow}</span>}<h3 id={titleId}>{title}</h3></div>
      {icon && <span className="nx-panel__icon" aria-hidden="true">{icon}</span>}
    </header>
    <div className="data-panel__body nx-panel__body">{children}</div>
  </section>;
}

export function EmptyRecord({ children = "No verified record is available." }: { children?: ReactNode }) {
  return <p className="empty-record nx-empty-record" data-nexus-state="empty">{children}</p>;
}
