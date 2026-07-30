import { useCallback, useEffect, useState } from "react";
import { LogIn, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import {
  isRegisteredExecutiveSessionRecord,
  registeredExecutiveSessionClient,
  RegisteredExecutiveSessionRequestError,
  type RegisteredExecutiveSessionEnvelope,
} from "../lib/local-client";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";

type Availability = "checking" | "enabled" | "disabled" | "unavailable";

const displayTime = (value: string | undefined) => {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Unavailable" : parsed.toLocaleString();
};

export function RegisteredExecutiveSession() {
  const [envelope, setEnvelope] = useState<RegisteredExecutiveSessionEnvelope | null>(null);
  const [availability, setAvailability] = useState<Availability>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const accept = useCallback((next: RegisteredExecutiveSessionEnvelope) => {
    setEnvelope(next);
    setAvailability(next.executiveSession.enabled ? "enabled" : "disabled");
    setMessage("");
  }, []);

  const reject = useCallback((caught: unknown) => {
    setEnvelope(null);
    if (
      caught instanceof RegisteredExecutiveSessionRequestError
      && caught.code === "executive_session_disabled"
    ) {
      setAvailability("disabled");
      setMessage("Registered Executive sessions are not enabled in this non-production deployment.");
      return;
    }
    setAvailability("unavailable");
    setMessage(
      caught instanceof Error
        ? caught.message
        : "Registered Executive session verification is unavailable.",
    );
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      accept(await registeredExecutiveSessionClient.status());
    } catch (caught) {
      reject(caught);
    } finally {
      setBusy(false);
    }
  }, [accept, reject]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = window.setInterval(revalidate, 30_000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [refresh]);

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      accept(await registeredExecutiveSessionClient.login());
    } catch (caught) {
      reject(caught);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMessage("");
    try {
      accept(await registeredExecutiveSessionClient.revoke());
    } catch (caught) {
      reject(caught);
    } finally {
      setBusy(false);
    }
  }

  const session = envelope?.session;
  const canonical = isRegisteredExecutiveSessionRecord(session) ? session : null;
  const active = canonical?.state === "active";
  const state = canonical?.state
    ?? (availability === "checking" ? "checking" : availability === "disabled" ? "not enabled" : "not established");

  return <DataPanel
    eyebrow="Human identity boundary"
    title="Registered Executive session"
    icon={<ShieldCheck size={18} />}
  >
    {canonical ? <>
      <div className="session-strip">
        <article><span>Human principal</span><strong>{canonical.humanIdentity.principalId}</strong></article>
        <article><span>Gateway service</span><strong>{canonical.serviceIdentity.principalId}</strong></article>
        <article><span>Tenant</span><strong>{canonical.scopeBinding.tenantId}</strong></article>
        <article><span>Workspace</span><strong>{canonical.scopeBinding.workspaceId}</strong></article>
        <article><span>Role</span><strong>{canonical.role}</strong></article>
        <StatusPill value={state} />
      </div>
      <p className="boundary-note">
        Scopes: {canonical.scopes.join(", ")}. Session expiration: {displayTime(canonical.lifecycle.expiresAt)}.
        Policy: {canonical.policyBinding.policyId}@{canonical.policyBinding.policyVersion}.
      </p>
      <p className="boundary-note">
        The verified human and the Experience Gateway service remain separate principals.
        This session creates no Decision, Mission, Authority Grant, approval, or action authorization.
      </p>
    </> : <EmptyRecord>
      {availability === "checking"
        ? "Checking the Runtime-owned Registered Executive session record."
        : "No Runtime-verified Registered Executive session is established in this browser."}
    </EmptyRecord>}

    {message && <section className="operation-error" role="alert"><ShieldX size={18} /><span>{message}</span></section>}

    <div className="operation-actions">
      {!active && availability !== "disabled" && <button onClick={() => void login()} disabled={busy}>
        <LogIn size={15} /> Verify current Replit identity
      </button>}
      {active && <button className="danger-action" onClick={() => void revoke()} disabled={busy}>
        <ShieldX size={15} /> Revoke human session
      </button>}
      <button className="secondary-action" onClick={() => void refresh()} disabled={busy}>
        <RefreshCw size={15} /> Refresh status
      </button>
    </div>
    <p className="boundary-note">
      Login sends an empty same-origin request. Identity, tenant, workspace, role, and scope are selected
      only by server verification and registration; this client stores no provider token or provider subject.
    </p>
  </DataPanel>;
}
