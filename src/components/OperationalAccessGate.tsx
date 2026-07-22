import { useState } from "react";
import { KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { operationalSessionClient, type OperationalSession } from "../lib/local-client";

export function OperationalAccessGate({
  workspace,
  onAuthenticated,
}: {
  workspace: string;
  onAuthenticated: (session: OperationalSession) => void;
}) {
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authenticate = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await operationalSessionClient.login(accessKey);
      operationalSessionClient.use(session);
      setAccessKey("");
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operational authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="operational-access-gate" aria-labelledby="operational-access-title">
    <div className="operational-access-gate__icon"><ShieldCheck size={28} /></div>
    <div>
      <span className="nx-eyebrow">Governed operational access</span>
      <h2 id="operational-access-title">Connect to {workspace}</h2>
      <p>This workspace reads and changes Runtime-owned operational state. Authenticate once to establish the tenant, workspace, role, and permission scope for this browser session.</p>
    </div>
    <div className="session-login operational-access-gate__form">
      <label className="operation-field"><span>Operator access key</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && accessKey.length >= 16 && !busy) void authenticate(); }} placeholder="Enter the hosted operator access key" /></label>
      <button className="secondary-action" onClick={() => void authenticate()} disabled={busy || accessKey.length < 16}><KeyRound size={14} />{busy ? "Authenticating…" : "Connect workspace"}</button>
    </div>
    {error && <div className="operation-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
    <p className="boundary-note">The key is exchanged for an HttpOnly, scoped session and is never stored in browser storage. Authentication does not create operational Authority or bypass mission governance.</p>
  </section>;
}
