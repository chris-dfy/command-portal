import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FastForward, Pause, Play, RefreshCw, RotateCcw, Sparkles, Zap } from "lucide-react";
import { DataPanel, EmptyRecord } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { replayClient } from "../lib/replay-client";

const STAGES = [
  { id: "observation", label: "Observation", description: "What the Runtime observed as input and context." },
  { id: "evidence", label: "Evidence", description: "Evidence the Runtime gathered and validated." },
  { id: "representation", label: "Representation", description: "How the Runtime represented the situation internally." },
  { id: "conclave", label: "Conclave", description: "Challenge, dissent, and synthesis inside the Runtime." },
  { id: "authority", label: "Authority", description: "Governance authorization applied by the Runtime." },
  { id: "decision", label: "Decision", description: "The bounded decision the Runtime reached." },
  { id: "receipt", label: "Receipt", description: "The execution receipt and proof recorded by the Runtime." }
] as const;

type StageId = typeof STAGES[number]["id"];
type Speed = 0.5 | 1 | 1.5 | 2;
const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];
const STAGE_INTERVAL_BASE_MS = 2000;

const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const asList = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : null;

function stageEvent(events: Record<string, unknown>[], stageId: StageId): Record<string, unknown> | null {
  return events.find((event) => String(event.stage ?? "").toLowerCase() === stageId) ?? null;
}

export function OperationalReplay() {
  const [replays, setReplays] = useState<Record<string, unknown>[] | null>(null);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainUnavailable, setExplainUnavailable] = useState(false);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const playTimer = useRef<number | null>(null);

  const loadSessions = useCallback(() => {
    setLoadingList(true);
    replayClient.listReplays().then((envelope) => {
      const sessions = asList(envelope.data) ?? asList(asRecord(envelope.data)?.sessions);
      if (envelope.ok && sessions) {
        setReplays(sessions);
        setListUnavailable(false);
      } else {
        setReplays([]);
        setListUnavailable(!envelope.ok);
      }
    }).catch(() => { setReplays([]); setListUnavailable(true); }).finally(() => setLoadingList(false));
  }, []);

  useEffect(() => loadSessions(), [loadSessions]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    setDetail(null);
    setEvents([]);
    setStageIndex(0);
    setPlaying(false);
    setExplanation(null);
    setExplainUnavailable(false);
    Promise.all([replayClient.getReplay(selectedId), replayClient.getEvents(selectedId)]).then(([detailEnvelope, eventsEnvelope]) => {
      if (detailEnvelope.ok) setDetail(asRecord(detailEnvelope.data));
      const supplied = asList(eventsEnvelope.data) ?? asList(asRecord(eventsEnvelope.data)?.events);
      if (eventsEnvelope.ok && supplied) setEvents(supplied);
    }).finally(() => setLoadingDetail(false));
  }, [selectedId]);

  useEffect(() => {
    if (!playing) return;
    const interval = STAGE_INTERVAL_BASE_MS / speed;
    playTimer.current = window.setInterval(() => {
      setStageIndex((index) => {
        if (index >= STAGES.length - 1) { setPlaying(false); return index; }
        return index + 1;
      });
    }, interval);
    return () => { if (playTimer.current !== null) { window.clearInterval(playTimer.current); playTimer.current = null; } };
  }, [playing, speed]);

  const clearExplanation = () => { setExplanation(null); setExplainUnavailable(false); };

  const handleExplain = useCallback(() => {
    if (!selectedId) return;
    setLoadingExplain(true);
    clearExplanation();
    replayClient.explainStage(selectedId, STAGES[stageIndex].id).then((envelope) => {
      const supplied = asRecord(envelope.data)?.explanation;
      if (envelope.ok && typeof supplied === "string" && supplied.length) {
        setExplanation(supplied);
      } else {
        setExplainUnavailable(true);
      }
    }).catch(() => setExplainUnavailable(true)).finally(() => setLoadingExplain(false));
  }, [selectedId, stageIndex]);

  const currentStage = STAGES[stageIndex];
  const currentEvent = stageEvent(events, currentStage.id);

  return <div className="replay-layout">
    <aside className="replay-list-panel">
      <DataPanel eyebrow="Operational Replay" title="Replay sessions" icon={<RotateCcw size={18} />}>
        {loadingList ? <p className="replay-loading">Loading replay sessions from Runtime…</p>
          : listUnavailable ? <EmptyRecord>Runtime did not supply replay sessions. Replay data is unavailable.</EmptyRecord>
          : !replays?.length ? <EmptyRecord>No replay sessions are available from Runtime.</EmptyRecord>
          : <div className="replay-session-list">
              {replays.map((session) => {
                const id = String(session.id ?? session.sessionId ?? "");
                const label = String(session.label ?? session.name ?? id);
                return <button key={id} className={`replay-session-item${selectedId === id ? " active" : ""}`} onClick={() => setSelectedId(id)}>
                  <span className="replay-session-label">{label}</span>
                  <StatusPill value={String(session.status ?? "unknown")} />
                </button>;
              })}
            </div>}
        <button className="replay-refresh-list" onClick={loadSessions} disabled={loadingList}><RefreshCw size={13} /> Refresh sessions</button>
        <p className="boundary-note">Replay sessions, events, and explanations are read from Runtime through the Experience Gateway. Nothing shown here is synthesized in the browser.</p>
      </DataPanel>
    </aside>

    <div className="replay-workspace">
      {!selectedId ? <DataPanel eyebrow="Stage replay" title="Select a session" icon={<RotateCcw size={18} />}>
          <EmptyRecord>Select a replay session to begin stage-by-stage playback of Runtime events.</EmptyRecord>
        </DataPanel>
      : loadingDetail ? <DataPanel eyebrow="Stage replay" title="Loading session" icon={<RotateCcw size={18} />}>
          <p className="replay-loading">Fetching replay detail and events from Runtime…</p>
        </DataPanel>
      : <>
        <section className="replay-timeline-panel">
          <div className="replay-timeline" role="list" aria-label="Replay stage timeline">
            {STAGES.map((stage, index) => <button
              key={stage.id}
              role="listitem"
              className={`replay-stage-marker${index === stageIndex ? " active" : index < stageIndex ? " completed" : ""}`}
              onClick={() => { setStageIndex(index); setPlaying(false); clearExplanation(); }}
              aria-current={index === stageIndex ? "step" : undefined}>
              <span className="replay-stage-number">{index + 1}</span>
              <span className="replay-stage-label">{stage.label}</span>
            </button>)}
          </div>
          <div className="replay-controls" role="toolbar" aria-label="Replay playback controls">
            <button className="replay-ctrl-btn" onClick={() => { setStageIndex(0); setPlaying(false); clearExplanation(); }} aria-label="Restart"><RotateCcw size={15} /><span>Restart</span></button>
            <button className="replay-ctrl-btn" onClick={() => { setStageIndex((index) => Math.max(0, index - 1)); clearExplanation(); }} disabled={stageIndex === 0} aria-label="Previous stage"><ChevronLeft size={15} /><span>Previous</span></button>
            <button className="replay-ctrl-btn replay-play-btn" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <><Pause size={15} /><span>Pause</span></> : <><Play size={15} /><span>Play</span></>}
            </button>
            <button className="replay-ctrl-btn" onClick={() => { setStageIndex((index) => Math.min(STAGES.length - 1, index + 1)); clearExplanation(); }} disabled={stageIndex === STAGES.length - 1} aria-label="Next stage"><span>Next</span><ChevronRight size={15} /></button>
            <button className="replay-ctrl-btn replay-speed-btn" onClick={() => setSpeed((value) => SPEEDS[(SPEEDS.indexOf(value) + 1) % SPEEDS.length])} aria-label={`Playback speed ${speed}x`}><FastForward size={14} /><span>{speed}x</span></button>
          </div>
        </section>

        <DataPanel eyebrow={`Stage ${stageIndex + 1} of ${STAGES.length}`} title={currentStage.label} icon={<Zap size={18} />} className="replay-stage-inspector">
          <p className="stage-description">{currentStage.description}</p>
          {currentEvent ? <div className="replay-event-detail">
              {Object.entries(currentEvent).slice(0, 12).map(([key, value]) => <div className="replay-event-field" key={key}>
                <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
              </div>)}
            </div>
          : <EmptyRecord>Runtime supplied no event data for the {currentStage.label} stage of this session.</EmptyRecord>}
          <div className="replay-explain-row">
            <button className="replay-explain-btn" onClick={handleExplain} disabled={loadingExplain}>
              <Sparkles size={14} />{loadingExplain ? "Requesting explanation from Runtime…" : "Explain This Step"}
            </button>
          </div>
          {(explanation !== null || explainUnavailable) && <div className={`replay-explain-panel${explainUnavailable ? " unavailable" : ""}`}>
            {explainUnavailable ? <p>Runtime supplied no explanation for this stage.</p> : <p>{explanation}</p>}
          </div>}
        </DataPanel>

        {detail && <DataPanel eyebrow="Session context" title="Replay metadata" icon={<RefreshCw size={18} />}>
          <div className="replay-event-detail">
            {Object.entries(detail).filter(([key]) => key !== "events").slice(0, 10).map(([key, value]) => <div className="replay-event-field" key={key}>
              <dt>{key}</dt><dd>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
            </div>)}
          </div>
        </DataPanel>}
      </>}
    </div>
  </div>;
}
