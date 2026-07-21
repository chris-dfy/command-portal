import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { NexusPageHeader, NexusStatus } from "../design-system/NexusPrimitives";

type NexusTone = "neutral" | "info" | "success" | "attention" | "critical";

export function NexusWorkspaceFrame({
  eyebrow,
  title,
  description,
  icon: Icon,
  connectionLabel,
  connectionTone,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  connectionLabel: string;
  connectionTone: NexusTone;
  children: ReactNode;
}) {
  return (
    <div className="nx-route-workspace">
      <NexusPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={<Icon aria-hidden="true" />}
        actions={<NexusStatus tone={connectionTone} pulse={connectionTone === "success"}>{connectionLabel}</NexusStatus>}
      />
      <div className="nx-route-workspace__content">{children}</div>
    </div>
  );
}
