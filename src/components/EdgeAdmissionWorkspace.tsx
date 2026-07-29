import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  BadgeCheck,
  Ban,
  BrainCircuit,
  Clock3,
  FileCheck2,
  FileKey2,
  HeartPulse,
  Link2,
  ListChecks,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import {
  NexusButton,
  NexusCallout,
  NexusMetric,
  NexusPanel,
  NexusStateView,
  NexusStatus,
  type NexusTone,
} from "../design-system/NexusPrimitives";
import {
  localNexusClient,
  operationalSessionClient,
  type OperationalSession,
  type RuntimeAdmission,
  type RuntimeAdmissionCapability,
  type RuntimeAdmissionIntentRequest,
  type RuntimeAdmissionResponse,
} from "../lib/local-client";

const ADMISSION_REFRESH_INTERVAL_MS = 5_000;
const ADMISSION_REQUEST_SCOPE = "edge:node_admission:request";
const ADMISSION_REVIEW_SCOPE = "edge:node_admission:review";
const TERMINAL_STATES = new Set(["ACTIVE", "DENIED", "EXPIRED", "FAILED", "CANCELLED"]);

type AdmissionForm = {
  missionId: string;
  displayName: string;
  nodeClass: string;
  requestedCapabilities: string;
  operationalPurpose: string;
  location: string;
  deploymentProfile: string;
  evidenceRefs: string;
};

type MissionOption = { missionId: string; label: string; status: string };
type SafeArtifact = { id: string; status: string; result: string; recordedAt: string };
type SafeReplayEvent = { eventId: string; stage: string; status: string; occurredAt: string; summary: string };

const INITIAL_FORM: AdmissionForm = {
  missionId: "",
  displayName: "",
  nodeClass: "edge_runtime_node",
  requestedCapabilities: "nexus.edge.runtime-coordination.connector",
  operationalPurpose: "",
  location: "",
  deploymentProfile: "",
  evidenceRefs: "",
};

const POLICY_KEYS = [
  "policyEvaluationId", "evaluationId", "state", "status", "outcome", "reason",
  "policyVersion", "conclaveRequired", "conclaveStatus", "conclaveReason",
  "approvalRequired", "approvalStatus", "approvalReason", "decisionId", "decisionStatus",
  "evaluatedAt", "evidenceRefs", "evidenceStatus", "evidenceRequirements", "requiredEvidence", "missingEvidence",
];
const AUTHORITY_KEYS = [
  "authorityGrantId", "state", "status", "authorizedAction", "capabilityScope",
  "decisionId", "accountabilityId", "issuerId", "issuedAt", "notBefore", "expiresAt",
  "remainingUses", "maxUses", "revokedAt", "consumedAt", "approvalRefs", "evidenceRefs",
];
const VERIFICATION_KEYS = [
  "verificationId", "state", "status", "outcome", "reason", "verifierId", "verifiedAt",
  "identityFingerprint", "runtimeVersion", "capabilities", "evidenceRefs", "duplicateIdentity",
  "grantBindingVerified", "proofVerified",
];
const ASSET_KEYS = [
  "operationalAssetId", "nodeId", "version", "type", "assetType", "state", "status",
  "lifecycleStatus", "lifecycleState", "identityFingerprint", "connector", "module", "moduleId",
  "capabilities", "admittedCapabilities", "trustState", "createdAt", "proofRefs", "receiptRefs", "replayRefs",
];
const HEARTBEAT_KEYS = [
  "state", "status", "messageId", "receivedAt", "observedAt", "reason", "evidenceRef",
  "proofRef", "receiptRef", "signatureVerified", "postconditionsVerified",
];

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
  : [];
const messageFrom = (value: unknown) => value instanceof Error ? value.message : String(value);
const readable = (value?: string | null) => value ? value.replace(/[_-]+/g, " ") : "not recorded";

function timestamp(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(value?: string | null): NexusTone {
  const normalized = (value ?? "").toLowerCase();
  if (["active", "admitted", "authorized", "bound", "complete", "completed", "current", "healthy", "issued", "passed", "ready", "recorded", "verified"].includes(normalized)) return "success";
  if (["cancelled", "denied", "expired", "failed", "invalid", "revoked"].includes(normalized)) return "critical";
  if (["awaiting_authority", "awaiting_node_proof", "challenge_issued", "degraded", "pending", "requested", "verification_pending"].includes(normalized)) return "attention";
  return "info";
}

function safeRecord(value: unknown, allowedKeys: string[]) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  return Object.fromEntries(allowedKeys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function safeTasks(value: RuntimeAdmission["taskGraph"]) {
  const tasks = Array.isArray(value) ? value : value?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    const source = object(task);
    return {
      taskId: String(source.taskId ?? source.id ?? ""),
      title: String(source.title ?? source.name ?? source.taskId ?? source.id ?? "Unnamed task"),
      state: String(source.state ?? source.status ?? "not_recorded"),
      reason: typeof source.reason === "string" ? source.reason : "",
      evidenceRefs: stringList(source.evidenceRefs),
      receiptRefs: stringList(source.receiptRefs),
      replayRefs: stringList(source.replayRefs),
    };
  });
}

function safeAdmission(value: RuntimeAdmission): RuntimeAdmission {
  const source = value as RuntimeAdmission & Record<string, unknown>;
  const intent = object(source.intent);
  const challenge = source.challenge ? {
    state: source.challenge.state,
    status: source.challenge.status,
    issuedAt: source.challenge.issuedAt,
    expiresAt: source.challenge.expiresAt,
    attemptsRemaining: source.challenge.attemptsRemaining,
    reissueCount: source.challenge.reissueCount,
    reissueAvailable: source.challenge.reissueAvailable,
    secretValuesExposed: false as const,
  } : null;
  return {
    admissionRequestId: String(source.admissionRequestId ?? ""),
    version: source.version,
    tenantId: typeof source.tenantId === "string" ? source.tenantId : undefined,
    workspaceId: typeof source.workspaceId === "string" ? source.workspaceId : undefined,
    missionId: String(source.missionId ?? ""),
    requestingPrincipalId: typeof source.requestingPrincipalId === "string" ? source.requestingPrincipalId : undefined,
    intent: {
      displayName: String(intent.displayName ?? ""),
      nodeClass: String(intent.nodeClass ?? ""),
      requestedCapabilities: stringList(intent.requestedCapabilities),
      operationalPurpose: String(intent.operationalPurpose ?? ""),
      ...(typeof intent.location === "string" ? { location: intent.location } : {}),
      ...(object(intent.deploymentMetadata) ? { deploymentMetadata: object(intent.deploymentMetadata) as Record<string, string | number | boolean | null> } : {}),
      evidenceRefs: stringList(intent.evidenceRefs),
    },
    lifecycleState: String(source.lifecycleState ?? ""),
    operationalState: typeof source.operationalState === "string" ? source.operationalState : undefined,
    awaitingNodeProof: typeof source.awaitingNodeProof === "boolean" ? source.awaitingNodeProof : undefined,
    requiredNextAction: typeof source.requiredNextAction === "string" ? source.requiredNextAction : undefined,
    taskGraph: safeTasks(source.taskGraph),
    policy: safeRecord(source.policy, POLICY_KEYS),
    authority: safeRecord(source.authority, AUTHORITY_KEYS),
    challenge,
    verification: safeRecord(source.verification, VERIFICATION_KEYS),
    operationalAsset: safeRecord(source.operationalAsset, ASSET_KEYS),
    firstHeartbeat: safeRecord(source.firstHeartbeat, HEARTBEAT_KEYS),
    proofRefs: stringList(source.proofRefs),
    receiptRefs: stringList(source.receiptRefs),
    replayId: typeof source.replayId === "string" ? source.replayId : undefined,
    replayRefs: stringList(source.replayRefs),
    failure: source.failure ? {
      category: source.failure.category,
      code: source.failure.code,
      message: source.failure.message,
      reason: source.failure.reason,
      retryable: source.failure.retryable,
      remediation: source.failure.remediation,
      nextAction: source.failure.nextAction,
      occurredAt: source.failure.occurredAt,
    } : null,
    allowedOperations: Array.isArray(source.allowedOperations)
      ? stringList(source.allowedOperations)
      : Object.fromEntries(Object.entries(object(source.allowedOperations)).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    secretValuesExposed: false,
  };
}

function responseAdmission(response: RuntimeAdmissionResponse) {
  const envelope = response as { admission?: RuntimeAdmission; admissionRequest?: RuntimeAdmission; request?: RuntimeAdmission; secretValuesExposed?: boolean };
  const value = envelope.admission ?? envelope.admissionRequest ?? envelope.request ?? response as RuntimeAdmission;
  if (!value?.admissionRequestId) throw new Error("The Runtime returned no admission request identity.");
  if (envelope.secretValuesExposed !== false && value.secretValuesExposed !== false) {
    throw new Error("The admission response was rejected because its secret boundary was not verified.");
  }
  return safeAdmission(value);
}

function missionOptions(value: unknown): MissionOption[] {
  const source = object(value);
  const rows = Array.isArray(value) ? value : [source.missions, source.history, source.items].find(Array.isArray) ?? [];
  return (rows as unknown[]).map((item) => {
    const mission = object(item);
    const missionId = String(mission.missionId ?? mission.id ?? "");
    return {
      missionId,
      label: String(mission.userObjective ?? mission.objective ?? mission.title ?? "Mission"),
      status: String(mission.status ?? "recorded"),
    };
  }).filter((mission) => Boolean(mission.missionId));
}

function capabilityDependencies(capability?: RuntimeAdmissionCapability) {
  const dependencies = capability?.dependencies;
  if (Array.isArray(dependencies)) return dependencies;
  if (!dependencies || typeof dependencies !== "object") return [];
  return Object.entries(dependencies).map(([id, dependency]) => {
    if (typeof dependency === "boolean") return { capabilityId: id, available: dependency, healthy: dependency, state: dependency ? "available" : "unavailable" };
    if (typeof dependency === "string") return { capabilityId: id, state: dependency };
    return { capabilityId: id, ...dependency };
  });
}

function dependencyReady(dependency: ReturnType<typeof capabilityDependencies>[number]) {
  if (dependency.available === false || dependency.healthy === false) return false;
  if (dependency.available === true || dependency.healthy === true) return true;
  return ["active", "available", "healthy", "operational", "ready", "verified"].includes((dependency.state ?? "").toLowerCase());
}

function operationAllowed(admission: RuntimeAdmission, operation: "cancel" | "challenge.reissue") {
  const aliases = operation === "cancel" ? ["cancel", "admission.cancel"] : ["challenge.reissue", "reissue_challenge", "admission.challenge.reissue"];
  if (Array.isArray(admission.allowedOperations)) return admission.allowedOperations.some((value) => aliases.some((alias) => value === alias || value.endsWith(`.${alias}`)));
  return Object.entries(admission.allowedOperations ?? {}).some(([key, allowed]) => allowed && aliases.some((alias) => key === alias || key.endsWith(`.${alias}`)));
}

function recordText(value: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) if (typeof value?.[key] === "string" && value[key]) return String(value[key]);
  return undefined;
}

function recordBoolean(value: Record<string, unknown> | null | undefined, key: string) {
  return typeof value?.[key] === "boolean" ? value[key] as boolean : undefined;
}

function recordDisplay(value: Record<string, unknown> | null | undefined, keys: string[], fallback = "Not recorded") {
  for (const key of keys) {
    const item = value?.[key];
    if (typeof item === "string" && item) return item;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    const items = stringList(item);
    if (items.length) return items.join(", ");
  }
  return fallback;
}

function lifecycleStages(admission: RuntimeAdmission) {
  const conclaveRequired = recordBoolean(admission.policy, "conclaveRequired");
  const approvalRequired = recordBoolean(admission.policy, "approvalRequired");
  return [
    { label: "Intent", state: "requested", detail: admission.admissionRequestId },
    { label: "Mission", state: admission.missionId ? "bound" : "not_recorded", detail: admission.missionId },
    { label: "Policy", state: recordText(admission.policy, "state", "status", "outcome") ?? "not_recorded", detail: recordText(admission.policy, "reason", "policyEvaluationId", "evaluationId") },
    { label: "Conclave", state: conclaveRequired === false ? "not_required" : recordText(admission.policy, "conclaveStatus") ?? (conclaveRequired ? "pending" : "not_recorded"), detail: recordText(admission.policy, "conclaveReason") },
    { label: "Approval", state: approvalRequired === false ? "not_required" : recordText(admission.policy, "approvalStatus") ?? (approvalRequired ? "pending" : "not_recorded"), detail: recordText(admission.policy, "approvalReason") },
    { label: "Decision", state: recordText(admission.policy, "decisionStatus") ?? (recordText(admission.policy, "decisionId") ? "recorded" : "not_recorded"), detail: recordText(admission.policy, "decisionId") },
    { label: "Authority", state: recordText(admission.authority, "state", "status") ?? "not_recorded", detail: recordText(admission.authority, "authorityGrantId", "expiresAt") },
    { label: "Challenge", state: admission.challenge?.state ?? admission.challenge?.status ?? "not_recorded", detail: admission.challenge?.expiresAt ? `Expires ${timestamp(admission.challenge.expiresAt)}` : undefined },
    { label: "Verification", state: recordText(admission.verification, "state", "status", "outcome") ?? "not_recorded", detail: recordText(admission.verification, "reason", "verificationId") },
    { label: "Asset contract", state: recordText(admission.operationalAsset, "lifecycleStatus", "lifecycleState", "state", "status") ?? "not_recorded", detail: recordText(admission.operationalAsset, "operationalAssetId", "nodeId") },
    { label: "First heartbeat", state: recordText(admission.firstHeartbeat, "state", "status") ?? "not_recorded", detail: recordText(admission.firstHeartbeat, "reason", "receivedAt", "observedAt") },
    { label: "Admission", state: admission.lifecycleState, detail: `Updated ${timestamp(admission.updatedAt)}` },
    { label: "Operational state", state: admission.operationalState ?? "not_recorded", detail: admission.requiredNextAction ?? undefined },
  ];
}

function safeArtifact(value: Record<string, unknown>): SafeArtifact {
  const nested = object(value.receipt);
  const source = Object.keys(nested).length ? nested : value;
  return {
    id: String(source.receiptId ?? source.executionReceiptId ?? source.id ?? "Receipt identity not recorded"),
    status: String(source.status ?? source.state ?? "recorded"),
    result: String(source.result ?? source.outcome ?? "No result summary recorded"),
    recordedAt: String(source.completedAt ?? source.recordedAt ?? source.timestamp ?? ""),
  };
}

function safeReplayEvents(value: Record<string, unknown>): SafeReplayEvent[] {
  const replay = value.replay;
  const events = Array.isArray(value.events) ? value.events
    : Array.isArray(replay) ? replay
      : Array.isArray(object(replay).events) ? object(replay).events as unknown[]
        : [];
  return events.map((event) => {
    const source = object(event);
    return {
      eventId: String(source.eventId ?? source.id ?? "Replay event"),
      stage: String(source.stage ?? source.eventType ?? source.type ?? "operational"),
      status: String(source.status ?? source.state ?? "recorded"),
      occurredAt: String(source.occurredAt ?? source.recordedAt ?? source.timestamp ?? ""),
      summary: String(source.summary ?? source.explanation ?? source.reason ?? source.title ?? "No human-readable explanation recorded"),
    };
  });
}

export function EdgeAdmissionWorkspace({
  capability: fleetCapability,
  onFleetRefresh,
}: {
  capability?: RuntimeAdmissionCapability;
  onFleetRefresh: () => void;
}) {
  const [runtimeCapability, setRuntimeCapability] = useState<RuntimeAdmissionCapability>();
  const [session, setSession] = useState<OperationalSession>({ authenticated: false });
  const [missions, setMissions] = useState<MissionOption[]>([]);
  const [admissions, setAdmissions] = useState<RuntimeAdmission[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedAdmission, setSelectedAdmission] = useState<RuntimeAdmission | null>(null);
  const [form, setForm] = useState<AdmissionForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mutating, setMutating] = useState<"cancel" | "reissue" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCreateKey, setPendingCreateKey] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<{ operation: string; requestId: string; key: string } | null>(null);
  const [receipt, setReceipt] = useState<SafeArtifact | null>(null);
  const [replayEvents, setReplayEvents] = useState<SafeReplayEvent[]>([]);
  const [artifactLoading, setArtifactLoading] = useState<"receipt" | "replay" | null>(null);

  const capability = runtimeCapability ?? fleetCapability;
  const dependencies = useMemo(() => capabilityDependencies(capability), [capability]);
  const dependenciesReady = dependencies.length > 0 && dependencies.every(dependencyReady);
  const sessionAuthenticated = session.authenticated === true;
  const permissionGranted = session.scopes?.includes(ADMISSION_REQUEST_SCOPE) === true;
  const reviewPermissionGranted = session.scopes?.includes(ADMISSION_REVIEW_SCOPE) === true;
  const requestedCapabilities = useMemo(() => [...new Set(form.requestedCapabilities.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))], [form.requestedCapabilities]);
  const evidenceRefs = useMemo(() => [...new Set(form.evidenceRefs.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))], [form.evidenceRefs]);
  const capabilitiesValid = requestedCapabilities.length > 0 && requestedCapabilities.every((item) => item.startsWith("nexus."));
  const canCreate = Boolean(
    capability?.available === true
      && dependenciesReady
      && sessionAuthenticated
      && permissionGranted
      && form.missionId
      && form.displayName.trim()
      && form.nodeClass.trim()
      && form.operationalPurpose.trim()
      && capabilitiesValid,
  );
  const blockedDependency = dependencies.find((dependency) => !dependencyReady(dependency));
  const gateReason = capability?.available !== true
    ? capability?.reason ?? "The Runtime has not reported governed node admission as available."
    : !dependenciesReady
      ? blockedDependency?.reason ?? "One or more Runtime admission dependencies are not healthy."
      : !sessionAuthenticated
        ? "An authenticated hosted operational session is required."
        : !permissionGranted
          ? `The authenticated session lacks required permission: ${ADMISSION_REQUEST_SCOPE}.`
          : !form.missionId
            ? "Select the existing Mission that owns this admission request."
            : "Complete the required descriptive intent fields.";

  const loadAdmissions = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    const [admissionResult, missionResult, sessionResult] = await Promise.allSettled([
      localNexusClient.runtimeAdmissions(),
      localNexusClient.missions(),
      operationalSessionClient.status(),
    ]);
    const errors: string[] = [];
    if (sessionResult.status === "fulfilled") {
      operationalSessionClient.use(sessionResult.value);
      setSession(sessionResult.value);
    } else {
      operationalSessionClient.use({ authenticated: false });
      setSession({ authenticated: false });
      errors.push(messageFrom(sessionResult.reason));
    }
    if (missionResult.status === "fulfilled") {
      const options = missionOptions(missionResult.value);
      setMissions(options);
      setForm((current) => current.missionId || !options[0] ? current : { ...current, missionId: options[0].missionId });
    } else {
      setMissions([]);
      errors.push(messageFrom(missionResult.reason));
    }
    if (admissionResult.status === "fulfilled") {
      if (admissionResult.value.secretValuesExposed !== false) errors.push("The admission list was rejected because its secret boundary was not verified.");
      else {
        const values = admissionResult.value.admissions ?? admissionResult.value.admissionRequests ?? admissionResult.value.requests ?? [];
        const safe = values.filter((item) => Boolean(item?.admissionRequestId)).map(safeAdmission);
        setAdmissions(safe);
        setRuntimeCapability(admissionResult.value.admissionCapability);
        setSelectedId((current) => safe.some((item) => item.admissionRequestId === current) ? current : safe[0]?.admissionRequestId ?? "");
      }
    } else errors.push(messageFrom(admissionResult.reason));
    setLoadError(errors.length ? [...new Set(errors)].join(" ") : null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadAdmission = useCallback(async (requestId: string, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const admission = responseAdmission(await localNexusClient.runtimeAdmission(requestId));
      setSelectedAdmission(admission);
      setAdmissions((current) => [admission, ...current.filter((item) => item.admissionRequestId !== admission.admissionRequestId)]);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAdmissions(); }, [loadAdmissions]);
  useEffect(() => {
    if (!selectedId) { setSelectedAdmission(null); return; }
    const listProjection = admissions.find((item) => item.admissionRequestId === selectedId);
    if (listProjection) setSelectedAdmission(listProjection);
    void loadAdmission(selectedId, true);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId || (selectedAdmission && TERMINAL_STATES.has(selectedAdmission.lifecycleState.toUpperCase()))) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAdmission(selectedId, true);
    }, ADMISSION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadAdmission, selectedAdmission, selectedId]);

  function updateForm<K extends keyof AdmissionForm>(key: K, value: AdmissionForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setPendingCreateKey(null);
    setActionError(null);
  }

  async function createAdmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) { setActionError(gateReason); return; }
    const idempotencyKey = pendingCreateKey ?? `edge-admission:${globalThis.crypto.randomUUID()}`;
    setPendingCreateKey(idempotencyKey);
    const payload: RuntimeAdmissionIntentRequest = {
      missionId: form.missionId,
      intent: {
        displayName: form.displayName.trim(),
        nodeClass: form.nodeClass.trim(),
        requestedCapabilities,
        operationalPurpose: form.operationalPurpose.trim(),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(form.deploymentProfile.trim() ? { deploymentMetadata: { profile: form.deploymentProfile.trim() } } : {}),
        ...(evidenceRefs.length ? { evidenceRefs } : {}),
      },
    };
    setCreating(true);
    setActionError(null);
    try {
      const admission = responseAdmission(await localNexusClient.createRuntimeAdmission(payload, idempotencyKey));
      setAdmissions((current) => [admission, ...current.filter((item) => item.admissionRequestId !== admission.admissionRequestId)]);
      setSelectedAdmission(admission);
      setSelectedId(admission.admissionRequestId);
      setPendingCreateKey(null);
      setForm((current) => ({ ...INITIAL_FORM, missionId: current.missionId, nodeClass: current.nodeClass }));
      onFleetRefresh();
    } catch (error) {
      setActionError(messageFrom(error));
    } finally {
      setCreating(false);
    }
  }

  async function mutateAdmission(operation: "cancel" | "reissue") {
    if (!selectedAdmission) return;
    const requiredPermission = operation === "reissue" ? ADMISSION_REVIEW_SCOPE : ADMISSION_REQUEST_SCOPE;
    if (!session.scopes?.includes(requiredPermission)) {
      setActionError(`The authenticated session lacks required permission: ${requiredPermission}.`);
      return;
    }
    const idempotencyKey = pendingMutation?.operation === operation && pendingMutation.requestId === selectedAdmission.admissionRequestId
      ? pendingMutation.key
      : `edge-admission-${operation}:${globalThis.crypto.randomUUID()}`;
    setPendingMutation({ operation, requestId: selectedAdmission.admissionRequestId, key: idempotencyKey });
    setMutating(operation);
    setActionError(null);
    try {
      const response = operation === "cancel"
        ? await localNexusClient.cancelRuntimeAdmission(selectedAdmission.admissionRequestId, Number(selectedAdmission.version), "Operator cancelled the governed admission request", idempotencyKey)
        : await localNexusClient.reissueRuntimeAdmissionChallenge(selectedAdmission.admissionRequestId, Number(selectedAdmission.version), "Operator requested a governed replacement challenge", idempotencyKey);
      const admission = responseAdmission(response);
      setSelectedAdmission(admission);
      setAdmissions((current) => [admission, ...current.filter((item) => item.admissionRequestId !== admission.admissionRequestId)]);
      setPendingMutation(null);
      onFleetRefresh();
    } catch (error) {
      setActionError(messageFrom(error));
    } finally {
      setMutating(null);
    }
  }

  async function loadReceipt() {
    if (!selectedAdmission) return;
    setArtifactLoading("receipt");
    setActionError(null);
    try {
      const response = await localNexusClient.runtimeAdmissionReceipt(selectedAdmission.admissionRequestId);
      if (response.secretValuesExposed !== false) throw new Error("The receipt response did not verify its secret boundary.");
      setReceipt(safeArtifact(response));
    } catch (error) { setActionError(messageFrom(error)); }
    finally { setArtifactLoading(null); }
  }

  async function loadReplay() {
    if (!selectedAdmission) return;
    setArtifactLoading("replay");
    setActionError(null);
    try {
      const response = await localNexusClient.runtimeAdmissionReplay(selectedAdmission.admissionRequestId);
      if (response.secretValuesExposed !== false) throw new Error("The Replay response did not verify its secret boundary.");
      setReplayEvents(safeReplayEvents(response));
    } catch (error) { setActionError(messageFrom(error)); }
    finally { setArtifactLoading(null); }
  }

  const metrics = {
    total: admissions.length,
    active: admissions.filter((item) => item.lifecycleState.toUpperCase() === "ACTIVE").length,
    inProgress: admissions.filter((item) => !TERMINAL_STATES.has(item.lifecycleState.toUpperCase())).length,
    attention: admissions.filter((item) => ["DENIED", "EXPIRED", "FAILED"].includes(item.lifecycleState.toUpperCase())).length,
  };
  const selectedMission = missions.find((mission) => mission.missionId === form.missionId);
  const stages = selectedAdmission ? lifecycleStages(selectedAdmission) : [];
  const tasks = selectedAdmission ? safeTasks(selectedAdmission.taskGraph) : [];
  const replayReferences = selectedAdmission
    ? (selectedAdmission.replayRefs?.length
      ? stringList(selectedAdmission.replayRefs)
      : selectedAdmission.replayId ? [selectedAdmission.replayId] : [])
    : [];

  return <section className="edge-admission span-2" aria-label="Governed Edge node admission">
    <NexusPanel className="edge-admission-capability" eyebrow="Constitutional capability" title="Governed node admission" description="Request a vendor-neutral Edge Runtime node through Mission, policy, Authority, independent verification, an Operational Asset Contract, and first signed state." actions={<NexusStatus tone={capability?.available ? "success" : "attention"}>{readable(capability?.availability ?? (capability?.available ? "available" : "unavailable"))}</NexusStatus>}>
      <div className="edge-admission-capability-summary">
        <article><ShieldCheck /><span>Capability</span><strong>{capability?.capabilityId ?? "edge.node_admission"}</strong><small>{capability?.reason ?? "No Runtime capability explanation was returned."}</small></article>
        <article><BadgeCheck /><span>Client session</span><strong>{sessionAuthenticated ? "Authenticated" : "Not verified"}</strong><small>Authentication establishes identity; it does not create operational Authority.</small></article>
        <article><FileCheck2 /><span>Request permission</span><strong>{permissionGranted ? "Granted" : "Not granted"}</strong><small>{permissionGranted ? ADMISSION_REQUEST_SCOPE : gateReason}</small></article>
      </div>
      <div className="edge-admission-dependencies" aria-label="Admission dependencies">
        {dependencies.map((dependency) => {
          const id = dependency.dependencyId ?? dependency.capabilityId ?? dependency.id ?? dependency.name ?? "unnamed dependency";
          const state = dependency.state ?? (dependencyReady(dependency) ? "healthy" : "unavailable");
          return <article key={id}><span>{dependency.name ?? readable(id)}</span><NexusStatus tone={dependencyReady(dependency) ? "success" : "attention"}>{readable(state)}</NexusStatus>{dependency.reason && <small>{dependency.reason}</small>}</article>;
        })}
        {!dependencies.length && <p><TriangleAlert />The Runtime returned no dependency evaluation. Admission remains unavailable.</p>}
      </div>
      {(capability?.constitutionalRequirements?.length || capability?.knownLimitations?.length) ? <div className="edge-admission-capability-notes">
        {capability.constitutionalRequirements?.length ? <section><strong>Constitutional requirements</strong><ul>{capability.constitutionalRequirements.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
        {capability.knownLimitations?.length ? <section><strong>Runtime limitations</strong><ul>{capability.knownLimitations.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      </div> : null}
    </NexusPanel>

    <section className="edge-admission-metrics">
      <NexusMetric label="Admission requests" value={metrics.total} detail="Mission-bound requests in this scope" tone="info" />
      <NexusMetric label="In progress" value={metrics.inProgress} detail="Awaiting governed lifecycle work" tone={metrics.inProgress ? "attention" : "neutral"} />
      <NexusMetric label="Active" value={metrics.active} detail="Verified first signed state received" tone={metrics.active ? "success" : "neutral"} />
      <NexusMetric label="Needs attention" value={metrics.attention} detail="Denied, expired, or failed" tone={metrics.attention ? "critical" : "success"} />
    </section>

    <div className="edge-admission-layout">
      <NexusPanel className="edge-admission-request" eyebrow="Operator intent" title="Request node admission" description="Submit descriptive intent only. NEXUS derives scope and identity, evaluates policy, issues Authority, verifies the physical node, and creates the canonical asset contract.">
        <form onSubmit={(event) => void createAdmission(event)}>
          <label><span>Owning Mission</span><select value={form.missionId} onChange={(event) => updateForm("missionId", event.target.value)} required><option value="">Select an existing Mission</option>{missions.map((mission) => <option key={mission.missionId} value={mission.missionId}>{mission.label} · {mission.missionId}</option>)}</select><small>{selectedMission ? `Bound to ${selectedMission.missionId} (${readable(selectedMission.status)}).` : "Admission cannot begin without an existing Mission."}</small></label>
          <label><span>Node display name</span><input value={form.displayName} onChange={(event) => updateForm("displayName", event.target.value)} maxLength={120} placeholder="North operations node" autoComplete="off" required /></label>
          <label><span>Operational asset class</span><input value={form.nodeClass} onChange={(event) => updateForm("nodeClass", event.target.value)} maxLength={80} placeholder="edge_runtime_node" autoComplete="off" spellCheck={false} required /></label>
          <label><span>Operational purpose</span><textarea rows={3} value={form.operationalPurpose} onChange={(event) => updateForm("operationalPurpose", event.target.value)} maxLength={1000} placeholder="Describe the operational outcome this node will support." required /></label>
          <label><span>Requested capabilities</span><textarea rows={3} value={form.requestedCapabilities} onChange={(event) => updateForm("requestedCapabilities", event.target.value)} aria-invalid={!capabilitiesValid} /><small>Canonical nexus.* capability identifiers, separated by commas or lines.</small></label>
          <div className="edge-admission-form-row"><label><span>Location (optional)</span><input value={form.location} onChange={(event) => updateForm("location", event.target.value)} maxLength={240} placeholder="Operations lab" autoComplete="off" /></label><label><span>Deployment profile (optional)</span><input value={form.deploymentProfile} onChange={(event) => updateForm("deploymentProfile", event.target.value)} maxLength={240} placeholder="raspberry-pi" autoComplete="off" /></label></div>
          <label><span>Existing Evidence references (optional)</span><textarea rows={2} value={form.evidenceRefs} onChange={(event) => updateForm("evidenceRefs", event.target.value)} placeholder="Evidence IDs only—never secure enrollment material" /></label>
          {!capabilitiesValid && <p className="edge-admission-error"><TriangleAlert />At least one canonical nexus.* capability is required.</p>}
          {actionError && <p className="edge-admission-error" role="alert"><TriangleAlert />{actionError}</p>}
          {!canCreate && <p className="edge-admission-gate"><ShieldCheck />{gateReason}</p>}
          <footer><NexusButton variant="primary" type="submit" loading={creating} disabled={!canCreate}><Plus />Request governed admission</NexusButton></footer>
        </form>
      </NexusPanel>

      <NexusPanel className="edge-admission-list" eyebrow="Mission execution" title="Admission requests" description="Select a request to watch its persisted lifecycle. Runtime state remains authoritative." actions={<NexusButton variant="ghost" type="button" onClick={() => void loadAdmissions(true)} loading={refreshing}><RefreshCw />Refresh</NexusButton>}>
        {loading ? <NexusStateView state="loading" title="Resolving governed admissions" detail="NEXUS is reading the tenant- and workspace-scoped Mission Store projection." />
          : loadError && !admissions.length ? <NexusStateView state="failure" title="Admission service unavailable" detail={loadError} />
            : admissions.length ? <div role="list" className="edge-admission-list-items">{admissions.map((admission) => <button key={admission.admissionRequestId} type="button" role="listitem" data-active={selectedId === admission.admissionRequestId} onClick={() => { setSelectedId(admission.admissionRequestId); setReceipt(null); setReplayEvents([]); }}><span><Waypoints /></span><div><strong>{admission.intent.displayName || admission.admissionRequestId}</strong><small>{admission.admissionRequestId}</small><p>{admission.intent.operationalPurpose}</p></div><aside><NexusStatus tone={statusTone(admission.operationalState ?? admission.lifecycleState)}>{readable(admission.operationalState ?? admission.lifecycleState)}</NexusStatus><small>{timestamp(admission.updatedAt ?? admission.createdAt)}</small></aside></button>)}</div>
              : <NexusStateView state="empty" title="No admission requests" detail={capability?.available ? "Submit descriptive intent to begin the governed admission lifecycle." : capability?.reason ?? "Governed node admission is unavailable."} />}
        {loadError && admissions.length ? <p className="edge-admission-warning"><TriangleAlert />Latest admission refresh failed: {loadError}</p> : null}
      </NexusPanel>
    </div>

    <NexusPanel className="edge-admission-inspector" eyebrow="Operational evolution" title={selectedAdmission?.intent.displayName ?? "No admission selected"} description={selectedAdmission ? `${selectedAdmission.admissionRequestId} · Mission ${selectedAdmission.missionId}` : "Select an admission request to inspect policy, Authority, verification, proof, receipt, and Replay lineage."} actions={selectedAdmission && <><NexusStatus tone={statusTone(selectedAdmission.operationalState ?? selectedAdmission.lifecycleState)}>{readable(selectedAdmission.operationalState ?? selectedAdmission.lifecycleState)}</NexusStatus><NexusButton size="sm" variant="ghost" title={reviewPermissionGranted ? "Reissue the governed challenge" : `Requires ${ADMISSION_REVIEW_SCOPE}`} disabled={!reviewPermissionGranted || !operationAllowed(selectedAdmission, "challenge.reissue") || mutating !== null} loading={mutating === "reissue"} onClick={() => void mutateAdmission("reissue")}><RotateCcw />Reissue challenge</NexusButton><NexusButton size="sm" variant="danger" title={permissionGranted ? "Cancel the admission request" : `Requires ${ADMISSION_REQUEST_SCOPE}`} disabled={!permissionGranted || !operationAllowed(selectedAdmission, "cancel") || mutating !== null} loading={mutating === "cancel"} onClick={() => void mutateAdmission("cancel")}><Ban />Cancel request</NexusButton></>}>
      {selectedAdmission ? <>
        {selectedAdmission.awaitingNodeProof && <NexusCallout tone="attention" title="Awaiting physical node proof">{selectedAdmission.requiredNextAction ?? "The real node must claim its challenge and submit independently verifiable proof before NEXUS can verify, admit, or activate it."}</NexusCallout>}
        {selectedAdmission.failure && <aside className="edge-admission-failure"><TriangleAlert /><div><strong>{readable(selectedAdmission.failure.category ?? selectedAdmission.failure.code ?? "Admission failed")}</strong><p>{selectedAdmission.failure.message ?? selectedAdmission.failure.reason ?? "The Runtime recorded a failure without a public explanation."}</p><small>{selectedAdmission.failure.remediation ?? selectedAdmission.failure.nextAction ?? (selectedAdmission.failure.retryable ? "A governed retry may be available." : "Review policy and Evidence before taking further action.")}</small></div><NexusStatus tone="critical">{selectedAdmission.failure.retryable ? "retryable" : "action required"}</NexusStatus></aside>}
        <div className="edge-admission-stages">{stages.map((stage, index) => <article key={stage.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{stage.label}</strong><small>{stage.detail || "No public detail recorded"}</small></div><NexusStatus tone={statusTone(stage.state)}>{readable(stage.state)}</NexusStatus></article>)}</div>
        <div className="edge-admission-details">
          <section><header><Waypoints />Requested intent</header><dl><div><dt>Asset class</dt><dd>{selectedAdmission.intent.nodeClass}</dd></div><div><dt>Purpose</dt><dd>{selectedAdmission.intent.operationalPurpose}</dd></div><div><dt>Location</dt><dd>{selectedAdmission.intent.location ?? "Not supplied"}</dd></div><div><dt>Capabilities</dt><dd>{selectedAdmission.intent.requestedCapabilities.join(", ") || "Not recorded"}</dd></div><div><dt>Evidence references</dt><dd>{selectedAdmission.intent.evidenceRefs?.join(", ") || "None supplied"}</dd></div></dl></section>
          <section className="edge-admission-governance"><header><ShieldCheck />Evidence, policy, approval, and Authority</header><dl><div><dt>Evidence status</dt><dd>{recordDisplay(selectedAdmission.policy, ["evidenceStatus"])}</dd></div><div><dt>Required Evidence</dt><dd>{recordDisplay(selectedAdmission.policy, ["evidenceRequirements", "requiredEvidence"])}</dd></div><div><dt>Missing Evidence</dt><dd>{recordDisplay(selectedAdmission.policy, ["missingEvidence"], "None recorded")}</dd></div><div><dt>Policy outcome</dt><dd>{recordDisplay(selectedAdmission.policy, ["outcome", "status", "state"])}</dd></div><div><dt>Policy reason</dt><dd>{recordDisplay(selectedAdmission.policy, ["reason"])}</dd></div><div><dt>Conclave</dt><dd>{recordDisplay(selectedAdmission.policy, ["conclaveStatus", "conclaveReason"], recordBoolean(selectedAdmission.policy, "conclaveRequired") === false ? "Not required by policy" : "Not recorded")}</dd></div><div><dt>Approval</dt><dd>{recordDisplay(selectedAdmission.policy, ["approvalStatus", "approvalReason"], recordBoolean(selectedAdmission.policy, "approvalRequired") === false ? "Not required by policy" : "Not recorded")}</dd></div><div><dt>Decision</dt><dd>{recordDisplay(selectedAdmission.policy, ["decisionStatus", "decisionId"])}</dd></div><div><dt>Authority</dt><dd>{recordDisplay(selectedAdmission.authority, ["state", "status"])}</dd></div><div><dt>Authority Grant</dt><dd>{recordDisplay(selectedAdmission.authority, ["authorityGrantId"])}</dd></div><div><dt>Authority expires</dt><dd>{timestamp(recordText(selectedAdmission.authority, "expiresAt"))}</dd></div></dl></section>
          <section><header><ListChecks />Mission task graph</header>{tasks.length ? <ol>{tasks.map((task, index) => <li key={task.taskId || String(index)}><span>{index + 1}</span><div><strong>{task.title}</strong><small>{task.reason || `${task.evidenceRefs.length} Evidence reference(s)`}</small></div><NexusStatus tone={statusTone(task.state)}>{readable(task.state)}</NexusStatus></li>)}</ol> : <p>No task graph has been published for this request.</p>}</section>
          <section><header><FileKey2 />Challenge and verification</header><dl><div><dt>Challenge state</dt><dd>{readable(selectedAdmission.challenge?.state ?? selectedAdmission.challenge?.status)}</dd></div><div><dt>Issued</dt><dd>{timestamp(selectedAdmission.challenge?.issuedAt)}</dd></div><div><dt>Expires</dt><dd>{timestamp(selectedAdmission.challenge?.expiresAt)}</dd></div><div><dt>Attempts remaining</dt><dd>{selectedAdmission.challenge?.attemptsRemaining ?? "Not recorded"}</dd></div><div><dt>Verifier</dt><dd>{recordText(selectedAdmission.verification, "verifierId") ?? "Not recorded"}</dd></div><div><dt>Verification</dt><dd>{readable(recordText(selectedAdmission.verification, "state", "status", "outcome"))}</dd></div></dl><small className="edge-admission-safety">Secure enrollment values, private keys, and signing material never enter this client.</small></section>
          <section><header><HeartPulse />Operational Asset and first state</header><dl><div><dt>Operational Asset</dt><dd>{recordText(selectedAdmission.operationalAsset, "operationalAssetId") ?? "Not created"}</dd></div><div><dt>Canonical node</dt><dd>{recordText(selectedAdmission.operationalAsset, "nodeId") ?? "Derived only after verification"}</dd></div><div><dt>Trust</dt><dd>{readable(recordText(selectedAdmission.operationalAsset, "trustState"))}</dd></div><div><dt>Heartbeat</dt><dd>{readable(recordText(selectedAdmission.firstHeartbeat, "state", "status"))}</dd></div><div><dt>Received</dt><dd>{timestamp(recordText(selectedAdmission.firstHeartbeat, "receivedAt", "observedAt"))}</dd></div></dl></section>
          <section><header><MapPin />Server-derived accountability</header><dl><div><dt>Tenant</dt><dd>{selectedAdmission.tenantId ?? "Not returned"}</dd></div><div><dt>Workspace</dt><dd>{selectedAdmission.workspaceId ?? "Not returned"}</dd></div><div><dt>Mission</dt><dd>{selectedAdmission.missionId}</dd></div><div><dt>Requesting principal</dt><dd>{selectedAdmission.requestingPrincipalId ?? "Not returned"}</dd></div><div><dt>Operational state</dt><dd>{readable(selectedAdmission.operationalState)}</dd></div><div><dt>Physical proof</dt><dd>{selectedAdmission.awaitingNodeProof === true ? "Awaiting node proof" : selectedAdmission.awaitingNodeProof === false ? "Not awaiting node proof" : "Not reported"}</dd></div><div><dt>Required next action</dt><dd>{selectedAdmission.requiredNextAction ?? "No next action recorded"}</dd></div><div><dt>Projection version</dt><dd>{String(selectedAdmission.version ?? "Not returned")}</dd></div></dl></section>
        </div>
        <div className="edge-admission-lineage">
          <section><header><FileCheck2 />Proof</header>{stringList(selectedAdmission.proofRefs).map((reference) => <code key={reference}>{reference}</code>)}{!selectedAdmission.proofRefs?.length && <small>No proof reference recorded.</small>}</section>
          <section><header><ReceiptText />Receipt</header>{stringList(selectedAdmission.receiptRefs).map((reference) => <code key={reference}>{reference}</code>)}{receipt && <article><strong>{receipt.id}</strong><span>{readable(receipt.status)} · {receipt.result}</span><small>{timestamp(receipt.recordedAt)}</small></article>}<NexusButton size="sm" variant="ghost" disabled={!selectedAdmission.receiptRefs?.length || artifactLoading !== null} loading={artifactLoading === "receipt"} onClick={() => void loadReceipt()}><ReceiptText />Inspect receipt</NexusButton></section>
          <section><header><Activity />Operational Replay</header>{replayReferences.map((reference) => <code key={reference}>{reference}</code>)}<NexusButton size="sm" variant="ghost" disabled={!replayReferences.length || artifactLoading !== null} loading={artifactLoading === "replay"} onClick={() => void loadReplay()}><Link2 />Inspect Replay</NexusButton>{replayEvents.length ? <ol>{replayEvents.map((event) => <li key={event.eventId}><div><strong>{readable(event.stage)}</strong><small>{event.summary}</small></div><NexusStatus tone={statusTone(event.status)}>{readable(event.status)}</NexusStatus><time>{timestamp(event.occurredAt)}</time></li>)}</ol> : <small>{replayReferences.length ? "Load the human-readable operational evolution." : "No Replay reference recorded."}</small>}</section>
        </div>
      </> : <NexusStateView state="idle" title="Admission inspector standing by" detail="No admission state is inferred before a Runtime projection is selected." />}
    </NexusPanel>

    <footer className="edge-admission-boundary"><ShieldCheck />The client submits Mission-bound descriptive intent and renders Runtime truth.<span>·</span><BrainCircuit />Policy, Conclave, Decisions, Authority, verification, node identity, and asset creation remain server-owned.<span>·</span><Clock3 />Non-terminal requests refresh every five seconds while visible.</footer>
  </section>;
}
