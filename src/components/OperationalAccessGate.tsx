import { useState } from "react";
import { RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { operationalSessionClient, type OperationalSession } from "../lib/local-client";

export function OperationalAccessGate({
  workspace,
  onAuthenticated,
}: {
  workspace: string;
  onAuthenticated: (session: OperationalSession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reconnect = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await operationalSessionClient.status();
      if (!session.authenticated) {
        throw new Error("The private workspace session was not established.");
      }
      operationalSessionClient.use(session);
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automatic workspace connection failed.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="operational-access-gate" aria-labelledby="operational-access-title">
    <div className="operational-access-gate__icon"><ShieldCheck size={28} /></div>
    <div>
      <span className="nx-eyebrow">Governed operational access</span>
      <h2 id="operational-access-title">Reconnect to {workspace}</h2>
      <p>NEXUS normally connects this workspace automatically after the private deployment admits the user. Retry the server-managed connection if that bootstrap was interrupted.</p>
    </div>
    <div className="session-login operational-access-gate__form">
      <button className="secondary-action" onClick={() => void reconnect()} disabled={busy}><RefreshCw size={14} />{busy ? "Connecting…" : "Retry secure connection"}</button>
    </div>
    {error && <div className="operation-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
    <p className="boundary-note">The Experience Gateway issues an HttpOnly, scoped session only through the private hosted boundary. Connection grants bounded API access—not operational Authority—and never bypasses mission governance.</p>
  </section>;
}
