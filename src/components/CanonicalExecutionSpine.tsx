import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import {
  canonicalExecutionClient,
  type CanonicalExecutionGatewayResponse,
} from "../lib/local-client";
import { canonicalHostedActionAvailability } from "../lib/hosted-capability-gate";
import type { CapabilityRegistryProjection } from "../lib/types";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

const EDITED_FIXTURE = `${JSON.stringify({
  recordType: "nexus.mission4_fixture",
  state: "edited",
  value: "NEXUS-M4-VERIFIED",
})}\n`;

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
  const createAction = canonicalHostedActionAvailability(
    capabilityRegistry,
    {
      capabilityId: "canonical_execution_spine",
      method: "POST",
      pathTemplate: "/executive-authority/canonical-execution/missions",
    },
  );
  const executeAction = canonicalHostedActionAvailability(
    capabilityRegistry,
    {
      capabilityId: "canonical_execution_spine",
      method: "POST",
      pathTemplate: "/executive-authority/canonical-execution/missions/{mission_id}/actions",
    },
  );

  return <DataPanel
    eyebrow="Mission 4 non-production proof"
    title="Canonical execution spine"
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
        <span>Verified actions</span>
        <strong>{record?.actions.length ?? 0} / 2</strong>
      </article>
      <StatusPill value={record?.state ?? (ready ? "ready" : "unavailable")} />
    </div>

    {record && fixture ? <>
      <p className="boundary-note">
        Exact resource: {fixture.path}. Current digest: {fixture.currentDigest}.
      </p>
      <p className="boundary-note">
        The original effect and compensation each receive a separate Decision,
        one-use Authority Grant, receipt, independent digest observation, and
        passive Replay event. The browser supplies no identity or governance fields.
      </p>
    </> : <EmptyRecord>
      Establish a Registered Executive session, then create the exact admitted
      non-production Mission.
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
      {!record && <button
        onClick={() => void run(() => canonicalExecutionClient.createMission())}
        disabled={busy || !ready || !createAction.available}
        title={createAction.available ? undefined : createAction.reason}
      >
        <ShieldCheck size={15} /> Authorize exact Mission
      </button>}
      {record?.state === "authorized" && fixture && <button
        onClick={() => void run(() => canonicalExecutionClient.edit(
          record.missionId,
          fixture.path,
          fixture.currentDigest,
          EDITED_FIXTURE,
        ))}
        disabled={busy || !ready || !executeAction.available}
        title={!ready
          ? "Registered Executive session verification is required."
          : executeAction.available ? undefined : executeAction.reason}
      >
        <CheckCircle2 size={15} /> Execute bounded edit
      </button>}
      {record?.state === "edited" && fixture && <button
        onClick={() => void run(() => canonicalExecutionClient.restore(
          record.missionId,
          fixture.path,
          fixture.currentDigest,
          fixture.baselineDigest,
        ))}
        disabled={busy || !ready || !executeAction.available}
        title={!ready
          ? "Registered Executive session verification is required."
          : executeAction.available ? undefined : executeAction.reason}
      >
        <RotateCcw size={15} /> Execute compensation
      </button>}
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
      This surface is non-production and exact-resource only. Capability health
      never grants Authority; the accepted Mission history remains governed by
      its recorded gate and receipt lineage.
    </p>
    <p className="boundary-note">
      Mission creation: {createAction.reason} Action edit and compensation: {executeAction.reason}
    </p>
  </DataPanel>;
}
