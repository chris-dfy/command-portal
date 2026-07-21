import { BookOpen, FileCheck2, ShieldCheck, X } from "lucide-react";
import { NexusStatus } from "../design-system/NexusPrimitives";

type NexusTone = "neutral" | "info" | "success" | "attention" | "critical";

export function NexusContextInspector({
  featureLabel,
  routePath,
  sourceClass,
  connectionLabel,
  connectionTone,
  environment,
  runtimeVersion,
  failureCount,
  proofId,
  receiptId,
  onClose,
}: {
  featureLabel: string;
  routePath: string;
  sourceClass: string;
  connectionLabel: string;
  connectionTone: NexusTone;
  environment: string;
  runtimeVersion: string;
  failureCount: number;
  proofId?: string;
  receiptId?: string;
  onClose: () => void;
}) {
  return (
    <aside id="context-inspector" className="nx-context-drawer" aria-label="Context inspector">
      <header>
        <div>
          <span>Context Inspector</span>
          <strong>{featureLabel}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close context inspector"><X aria-hidden="true" /></button>
      </header>

      <section>
        <h2>Operational context</h2>
        <dl>
          <div><dt>Route</dt><dd>{routePath}</dd></div>
          <div><dt>Knowledge class</dt><dd>{sourceClass.replace(/_/g, " ")}</dd></div>
          <div><dt>Environment</dt><dd>{environment}</dd></div>
          <div><dt>Runtime</dt><dd>{connectionLabel}</dd></div>
          <div><dt>Version</dt><dd>{runtimeVersion}</dd></div>
          <div><dt>Gateway signals</dt><dd>{failureCount ? `${failureCount} unavailable` : "clear"}</dd></div>
        </dl>
      </section>

      <section>
        <h2><FileCheck2 aria-hidden="true" />Evidence</h2>
        {proofId || receiptId ? (
          <div className="nx-context-drawer__evidence">
            {proofId && <article><span>Proof</span><code>{proofId}</code></article>}
            {receiptId && <article><span>Receipt</span><code>{receiptId}</code></article>}
          </div>
        ) : <p>No active proof or receipt. NEXUS will not infer completion from presentation state.</p>}
      </section>

      <section>
        <h2><ShieldCheck aria-hidden="true" />Platform contract</h2>
        <ul>
          <li>Governed operational context</li>
          <li>Explicit source classification</li>
          <li>Independent mission evidence</li>
          <li>Mission and Knowledge Store separation</li>
          <li>Receipt-backed, replayable outcomes</li>
        </ul>
      </section>

      <footer>
        <BookOpen aria-hidden="true" />
        <div>
          <strong>Evidence boundary</strong>
          <p>Model-native reasoning may assist presentation. It is never proof of current operational state.</p>
          <NexusStatus tone={connectionTone}>{connectionLabel}</NexusStatus>
        </div>
      </footer>
    </aside>
  );
}
