import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  canonicalExecutionClient,
  type CanonicalExecutionGatewayResponse,
} from "../lib/local-client";
import type { CapabilityRegistryProjection } from "../lib/types";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

export function CanonicalExecutionSpine({
  capabilityRegistry = null,
}: {
  capabilityRegistry?: CapabilityRegistryProjection | null;
} = {}) {
  const [registeredExecutiveSessionVerified, setRegisteredExecutiveSessionVerified] = useState(false);
  const [mission, setMission] = useState<CanonicalExecutionGatewayResponse["data"]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const run = useCallback(async (
    work: () => Promise<CanonicalExecutionGatewayResponse>,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const next = await work();
      setRegisteredExecutiveSessionVerified(
        next.registeredExecutiveSessionVerified === true,
      );
      if (next.data?.mission) setMission(next.data);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Canonical execution failed safely.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(() => canonicalExecutionClient.status());
  }, [run]);

  const record = mission?.mission;
  const fixture = record?.fixture;
  const ready = registeredExecutiveSessionVerified;
  const completed = record?.state === "completed";
  const registryObserved = capabilityRegistry !== null;

  return <DataPanel
    eyebrow="Historical Mission 4 evidence"
    title="Canonical execution evidence"
    icon={<ShieldCheck size={18} />}
  >
    <div className="session-strip">
      <article>
        <span>Capability gate</span>
        <strong>{ready ? "All checks passed" : "Verification required"}</strong>
      </article>
      <article>
        <span>Mission</span>
        <strong>{record?.missionId ?? "Not created"}</strong>
      </article>
      <article>
        <span>Fixture version</span>
        <strong>{fixture?.version ?? 0}</strong>
      </article>
      <article>
        <span>Capability Registry</span>
        <strong>{registryObserved ? "Observed" : "Unavailable"}</strong>
      </article>
      <StatusPill value={record?.state ?? (ready ? "ready" : "unavailable")} />
    </div>

    {record && fixture ? <>
      <p className="boundary-note">
        Exact resource: {fixture.path}. Current digest: {fixture.currentDigest}.
      </p>
      <p className="boundary-note">
        This read-only record shows whether the original effect and compensation received a separate Decision,
        one-use Authority Grant, receipt, independent digest observation, and
        passive Replay event. It cannot admit another effect.
      </p>
    </> : <EmptyRecord>
      No retained Mission 4 evidence was returned. New Mission and Action
      requests must enter the canonical NEXUS interaction coordinator.
    </EmptyRecord>}

    {completed && <section className="operation-success" role="status">
      <CheckCircle2 size={18} />
      <span>
        Original Action and compensation verified. The fixture is back at its
        baseline digest and the canonical Mission is complete.
      </span>
    </section>}
    {message && <section className="operation-error" role="alert">
      <span>{message}</span>
    </section>}

    <div className="operation-actions">
      <button
        className="secondary-action"
        onClick={() => void run(
          record
            ? () => canonicalExecutionClient.mission(record.missionId)
            : () => canonicalExecutionClient.status(),
        )}
        disabled={busy}
      >
        <RefreshCw size={15} /> Refresh verified state
      </button>
    </div>
    <p className="boundary-note">
      This surface is read-only. Its former Mission creation and direct Action
      mutations are retired and return 410. Submit typed or spoken intent through
      POST /executive/interactions; only Runtime may classify and authorize it.
    </p>
  </DataPanel>;
}
