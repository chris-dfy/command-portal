import { useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, RefreshCw, Search, ShieldAlert, UploadCloud } from "lucide-react";
import { DataPanel } from "./DataPanel";
import {
  localNexusClient,
  operationalSessionClient,
  type IntakeHistory,
  type OperationalSession,
} from "../lib/local-client";
import { canonicalHostedControlAvailability } from "../lib/hosted-capability-gate";
import { successfulDocumentUploadMessage } from "../lib/document-intake-result";
import type { CapabilityRegistryProjection } from "../lib/types";
import {
  beginPrivateDraftAttempt,
  clearPrivateDraftAfterSuccess,
  retainPrivateDraftAfterFailure,
  snapshotPrivateDraftOperation,
  type PrivateDraftOperation,
} from "../lib/private-draft-operation";

type IntakeQueryPayload = { question: string; projectId?: string };

export function DocumentIntake({
  capabilityRegistry = null,
  session = { authenticated: false },
}: {
  capabilityRegistry?: CapabilityRegistryProjection | null;
  session?: OperationalSession;
} = {}) {
  const [history, setHistory] = useState<IntakeHistory | null>(null);
  const [projectId, setProjectId] = useState("");
  const [question, setQuestion] = useState("");
  const [pendingQuery, setPendingQuery] = useState<PrivateDraftOperation<IntakeQueryPayload> | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hostedAccess = {
    hosted: operationalSessionClient.mode() === "hosted",
    authenticated: session.authenticated,
    scopes: session.scopes,
  };
  const historyAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "knowledge.document_intake",
      method: "GET",
      pathTemplate: "/intake/history",
    },
    hostedAccess,
    "operations:read",
  );
  const uploadAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "knowledge.document_intake",
      method: "POST",
      pathTemplate: "/intake/upload",
    },
    hostedAccess,
    "evidence:write",
  );
  const queryAction = canonicalHostedControlAvailability(
    capabilityRegistry,
    {
      capabilityId: "knowledge.document_intake",
      method: "POST",
      pathTemplate: "/intake/query",
    },
    hostedAccess,
    "operations:read",
  );

  const refresh = async () => {
    if (!historyAction.available) throw new Error(historyAction.reason);
    setHistory(await localNexusClient.intakeHistory());
  };
  useEffect(() => {
    if (!historyAction.available) {
      setMessage(historyAction.reason);
      return;
    }
    void refresh().catch((error) => setMessage(messageFrom(error)));
  }, [historyAction.available, historyAction.reason]);

  async function upload(files: File[]) {
    if (!files.length) return;
    if (!uploadAction.available) {
      setMessage(uploadAction.reason);
      return;
    }
    setBusy(true); setMessage(null);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setMessage(`Ingesting ${index + 1} of ${files.length}: ${file.name}`);
        await localNexusClient.intakeUpload(file.name, await fileAsBase64(file), projectId.trim() || undefined);
      }
      if (!historyAction.available) {
        setMessage(successfulDocumentUploadMessage(files.length, historyAction));
      } else {
        try {
          await refresh();
          setMessage(successfulDocumentUploadMessage(files.length, historyAction));
        } catch (error) {
          setMessage(successfulDocumentUploadMessage(
            files.length,
            historyAction,
            messageFrom(error),
          ));
        }
      }
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  async function ask() {
    if (!pendingQuery && !question.trim()) return;
    if (!queryAction.available) {
      setAnswer(queryAction.reason);
      return;
    }
    const staged = pendingQuery ?? snapshotPrivateDraftOperation(
      {
        question: question.trim(),
        ...(projectId.trim() ? { projectId: projectId.trim() } : {}),
      },
      `intake-query:${globalThis.crypto.randomUUID()}`,
    );
    if (!pendingQuery) setQuestion("");
    const operation = beginPrivateDraftAttempt(staged);
    setPendingQuery(operation);
    setBusy(true); setAnswer(null);
    try {
      const result = await localNexusClient.intakeQuery(
        operation.payload.question,
        operation.payload.projectId,
        operation.idempotencyKey,
      );
      setPendingQuery(clearPrivateDraftAfterSuccess());
      setAnswer(result.answer);
    }
    catch (error) {
      setPendingQuery(retainPrivateDraftAfterFailure(operation));
      setAnswer(messageFrom(error));
    }
    finally { setBusy(false); }
  }

  const sources = history?.sources ?? [];
  const sensitive = useMemo(() => sources.filter((source) => source.secretScanStatus === "sensitive_detected").length, [sources]);
  const unsupported = useMemo(() => sources.filter((source) => source.extractionStatus === "unsupported").length, [sources]);

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="Runtime-owned capability" title="Document intelligence" icon={<UploadCloud size={18} />} className="span-2">
      <p className="workspace-intro">Add project documents through the authenticated Experience Gateway. The workspace-scoped Runtime extracts evidence, scans sensitive content, records proof, and treats source text as data—not instructions.</p>
      <div className={`upload-zone${dragging ? " is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (uploadAction.available) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
        <UploadCloud size={28} /><div><strong>Drop NEXUS project documents</strong><span>PDF, Office files, CSV, JSON, HTML, text, Markdown, and exported email</span></div>
        <button type="button" onClick={() => input.current?.click()} disabled={busy || !uploadAction.available} title={uploadAction.available ? undefined : uploadAction.reason}>Choose files</button>
        <input ref={input} className="sr-only" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.json,.html,.htm,.txt,.md,.eml,.mbox" onChange={(event) => void upload(Array.from(event.target.files ?? []))} disabled={!uploadAction.available} />
      </div>
      <label className="workspace-field"><span>Project ID for evidence linkage</span><input value={projectId} onChange={(event) => { setProjectId(event.target.value); setPendingQuery(null); }} placeholder="PROJECT-… or leave blank" /></label>
      {message && <p className="workspace-message" role="status">{message}</p>}
      <p className="boundary-note">Upload action: {uploadAction.reason}</p>
    </DataPanel>

    <DataPanel eyebrow="Evidence-grounded" title="Ask ingested sources" icon={<Search size={18} />}>
      <div className="workspace-stack"><textarea value={question} onChange={(event) => { setQuestion(event.target.value); setPendingQuery(null); }} placeholder="What requirements, prices, quantities, risks, and deadlines are supported by the source evidence?" autoComplete="off" /><button onClick={() => void ask()} disabled={busy || (!question.trim() && !pendingQuery) || !queryAction.available} title={queryAction.available ? undefined : queryAction.reason}><Search size={15} /> {pendingQuery ? "Retry exact source query" : "Ask sources"}</button></div>
      {answer && <pre className="evidence-answer">{answer}</pre>}
      <p className="boundary-note">Query action: {queryAction.reason}</p>
    </DataPanel>

    <DataPanel eyebrow="Registry truth" title="Source inventory" icon={<Database size={18} />}>
      <div className="metric-row"><span><strong>{sources.length}</strong> sources</span><span><strong>{history?.jobs.length ?? 0}</strong> jobs</span><span><strong>{sensitive}</strong> sensitive</span><span><strong>{unsupported}</strong> unsupported</span></div>
      <button className="quiet-action" onClick={() => void refresh().catch((error) => setMessage(messageFrom(error)))} disabled={busy || !historyAction.available} title={historyAction.available ? undefined : historyAction.reason}><RefreshCw size={14} /> Refresh registry</button>
    </DataPanel>

    <DataPanel eyebrow="Evidence viewer" title="Recent documents" icon={<FileText size={18} />} className="span-2">
      <div className="source-list">{sources.length ? sources.slice(0, 12).map((source) => <article key={source.sourceId}><div><strong>{source.normalizedTitle || source.originalFilename || source.sourceId}</strong><span>{source.sourceType || "source"} · {source.extractionStatus || "unknown"}</span></div><code>{source.projectId || "Unlinked"}</code><small>{source.proofId || "Proof unavailable"}</small></article>) : <p>No documents have been ingested in this workspace Runtime.</p>}</div>
      <p className="boundary-note"><ShieldAlert size={14} /> Workspace-scoped source of truth · The portal forwards only operator-selected files · Retention and provider use remain Runtime policy</p>
    </DataPanel>
  </div>;
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the selected file"));
    reader.onload = () => resolve(String(reader.result ?? "").split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : String(error);
