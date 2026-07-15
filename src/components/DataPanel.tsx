import type { ReactNode } from "react";

export function DataPanel({ eyebrow, title, icon, children, className = "" }: { eyebrow?: string; title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`data-panel ${className}`.trim()}>
    <header><div>{eyebrow && <span>{eyebrow}</span>}<h3>{title}</h3></div>{icon}</header>
    {children}
  </section>;
}

export function EmptyRecord({ children = "No verified record is available." }: { children?: ReactNode }) {
  return <p className="empty-record">{children}</p>;
}
