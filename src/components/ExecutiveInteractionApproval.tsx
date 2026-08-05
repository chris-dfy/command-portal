import type { RuntimeInteractionAdmission } from "../lib/runtime-voice-admission";
import { pendingExecutiveApprovalId } from "../lib/runtime-voice-admission";

export function ExecutiveInteractionApproval({ admission, busy, onApprove, onDeny }: {
  admission: RuntimeInteractionAdmission | null;
  busy: "approve" | "deny" | null;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const approvalId = pendingExecutiveApprovalId(admission);
  if (!approvalId) return null;

  return <section className="executive-interaction-approval" aria-label="Human approval required">
    <div>
      <small>HUMAN APPROVAL REQUIRED</small>
      <strong>Runtime has paused this governed request.</strong>
      <span>Approval {approvalId}</span>
    </div>
    <p>Approve only if you intend the exact Runtime-bound action to continue. NEXUS will resume the stored interaction through the canonical endpoint; this browser does not recreate the action or grant Authority.</p>
    <div className="executive-interaction-approval__actions">
      <button type="button" onClick={onApprove} disabled={busy !== null}>{busy === "approve" ? "Approving…" : "Approve and continue"}</button>
      <button type="button" data-variant="deny" onClick={onDeny} disabled={busy !== null}>{busy === "deny" ? "Denying…" : "Deny"}</button>
    </div>
  </section>;
}
