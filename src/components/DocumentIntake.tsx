import { useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, RefreshCw, Search, ShieldAlert, UploadCloud } from "lucide-react";
import { DataPanel } from "./DataPanel";
import { localNexusClient, type IntakeHistory } from "../lib/local-client";

export function DocumentIntake() {
  const [history, setHistory] = useState<IntakeHistory | null>(null);
  const [projectId, setProjectId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = async () => setHistory(await localNexusClient.intakeHistory());
  useEffect(() => { void refresh().catch((error) => setMessage(messageFrom(error))); }, []);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true); setMessage(null);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setMessage(`Ingesting ${index + 1} of ${files.length}: ${file.name}`);
        await localNexusClient.intakeUpload(file.name, await fileAsBase64(file), projectId.trim() || undefined);
      }
      await refresh();
      setMessage(`${files.length} document${files.length === 1 ? "" : "s"} ingested by the private NEXUS Runtime with evidence and proof.`);
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  async function ask() {
    setBusy(true); setAnswer(null);
    try { setAnswer((await localNexusClient.intakeQuery(question, projectId.trim() || undefined)).answer); }
    catch (error) { setAnswer(messageFrom(error)); }
    finally { setBusy(false); }
  }

  const sources = history?.sources ?? [];
  const sensitive = useMemo(() => sources.filter((source) => source.secretScanStatus === "sensitive_detected").length, [sources]);
  const unsupported = useMemo(() => sources.filter((source) => source.extractionStatus === "unsupported").length, [sources]);

  return <div className="experience-grid local-workspace">
    <DataPanel eyebrow="Private Runtime capability" title="Document intelligence" icon={<UploadCloud size={18} />} className="span-2">
      <p className="workspace-intro">Add project documents through the Experience Gateway. The private Runtime extracts evidence, scans sensitive content, records proof, and treats source text as data—not instructions.</p>
      <div className={`upload-zone${dragging ? " is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
        <UploadCloud size={28} /><div><strong>Drop Nexicron project documents</strong><span>PDF, Office files, CSV, JSON, HTML, text, Markdown, and exported email</span></div>
        <button type="button" onClick={() => input.current?.click()} disabled={busy}>Choose files</button>
        <input ref={input} className="sr-only" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.json,.html,.htm,.txt,.md,.eml,.mbox" onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
      </div>
      <label className="workspace-field"><span>Project ID for evidence linkage</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="PROJECT-… or leave blank" /></label>
      {message && <p className="workspace-message" role="status">{message}</p>}
    </DataPanel>

    <DataPanel eyebrow="Evidence-grounded" title="Ask ingested sources" icon={<Search size={18} />}>
      <div className="workspace-stack"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What requirements, prices, quantities, risks, and deadlines are supported by the source evidence?" /><button onClick={() => void ask()} disabled={busy || !question.trim()}><Search size={15} /> Ask sources</button></div>
      {answer && <pre className="evidence-answer">{answer}</pre>}
    </DataPanel>

    <DataPanel eyebrow="Registry truth" title="Source inventory" icon={<Database size={18} />}>
      <div className="metric-row"><span><strong>{sources.length}</strong> sources</span><span><strong>{history?.jobs.length ?? 0}</strong> jobs</span><span><strong>{sensitive}</strong> sensitive</span><span><strong>{unsupported}</strong> unsupported</span></div>
      <button className="quiet-action" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} /> Refresh registry</button>
    </DataPanel>

    <DataPanel eyebrow="Evidence viewer" title="Recent documents" icon={<FileText size={18} />} className="span-2">
      <div className="source-list">{sources.length ? sources.slice(0, 12).map((source) => <article key={source.sourceId}><div><strong>{source.normalizedTitle || source.originalFilename || source.sourceId}</strong><span>{source.sourceType || "source"} · {source.extractionStatus || "unknown"}</span></div><code>{source.projectId || "Unlinked"}</code><small>{source.proofId || "Proof unavailable"}</small></article>) : <p>No documents have been ingested in the private Runtime.</p>}</div>
      <p className="boundary-note"><ShieldAlert size={14} /> Local source of truth · Raw document text remains private · No cloud upload is performed by the portal</p>
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
