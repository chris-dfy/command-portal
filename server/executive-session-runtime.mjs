import {
  createHumanSessionAssertion,
  EXECUTIVE_PRINCIPAL_TYPE,
  EXECUTIVE_SCOPES,
  HUMAN_SESSION_ASSERTION_ALGORITHM,
  HUMAN_SESSION_ASSERTION_CONTRACT,
  HUMAN_SESSION_ASSERTION_HEADER,
  REGISTERED_EXECUTIVE_SESSION_CONTRACT,
} from "./executive-session.mjs";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,191}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,191}$/;
const RUNTIME_RESPONSE_MAXIMUM_BYTES = 1_048_576;
const ROOT_FIELDS = new Set([
  "recordType",
  "schemaVersion",
  "sessionId",
  "state",
  "humanIdentity",
  "serviceIdentity",
  "scopeBinding",
  "role",
  "scopes",
  "policyBinding",
  "assertionBinding",
  "lifecycle",
  "replayAndRevocation",
  "authorityBoundary",
  "receipt",
  "secretValuesExposed",
]);

const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;
const sameArray = (left, right) =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((item, index) => item === right[index]);
const exactFields = (value, expected) => {
  const fields = Object.keys(value ?? {});
  return (
    fields.length === expected.size &&
    fields.every((field) => expected.has(field))
  );
};
const timestampEquals = (value, seconds) =>
  typeof value === "string" &&
  !Number.isNaN(Date.parse(value)) &&
  Date.parse(value) === seconds * 1_000;

export class ExecutiveSessionRuntimeFailure extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "ExecutiveSessionRuntimeFailure";
    this.code = code;
    this.status = status;
  }
}

function invalid(message) {
  throw new ExecutiveSessionRuntimeFailure(
    "executive_session_runtime_response_invalid",
    message,
    502,
  );
}

async function readBoundedRuntimeBody(response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declared) &&
    declared > RUNTIME_RESPONSE_MAXIMUM_BYTES
  ) {
    throw new ExecutiveSessionRuntimeFailure(
      "executive_session_runtime_response_too_large",
      "Registered Executive session response exceeded the bounded size.",
      502,
    );
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > RUNTIME_RESPONSE_MAXIMUM_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The bounded failure below remains authoritative.
        }
        throw new ExecutiveSessionRuntimeFailure(
          "executive_session_runtime_response_too_large",
          "Registered Executive session response exceeded the bounded size.",
          502,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

function validateHumanIdentity(value, claims) {
  const identity = record(value);
  const fields = new Set([
    "registrationId",
    "principalId",
    "principalType",
    "provider",
    "providerIssuer",
    "providerSubjectBinding",
    "providerSubjectClientControlled",
    "providerSubjectRetained",
    "providerAssertionVerified",
    "humanVerified",
    "authenticationMethods",
    "authenticationTime",
  ]);
  if (
    !identity ||
    !exactFields(identity, fields) ||
    identity.registrationId !== claims.registrationId ||
    identity.principalId !== claims.principalId ||
    identity.principalType !== EXECUTIVE_PRINCIPAL_TYPE ||
    identity.provider !== claims.provider ||
    identity.providerIssuer !== claims.providerIssuer ||
    identity.providerSubjectBinding !==
      "server_verified_opaque_subject_to_preprovisioned_registration" ||
    identity.providerSubjectClientControlled !== false ||
    identity.providerSubjectRetained !== false ||
    identity.providerAssertionVerified !== true ||
    identity.humanVerified !== true ||
    !sameArray(identity.authenticationMethods, claims.authenticationMethods) ||
    !timestampEquals(identity.authenticationTime, claims.authenticationTime)
  ) {
    invalid("Runtime human identity did not match the registered executive session.");
  }
}

function validateServiceIdentity(value, config, claims) {
  const service = record(value);
  const fields = new Set([
    "principalId",
    "principalType",
    "authenticationMethod",
    "authenticatedBeforeHumanAssertion",
    "distinctFromHumanPrincipal",
  ]);
  if (
    !service ||
    !exactFields(service, fields) ||
    service.principalId !== config.humanSessionServiceBindingId ||
    service.principalType !== "experience_gateway_service" ||
    service.authenticationMethod !== "bound_service_credential" ||
    service.authenticatedBeforeHumanAssertion !== true ||
    claims.principalId === config.humanSessionServiceBindingId ||
    service.distinctFromHumanPrincipal !== true
  ) {
    invalid("Runtime service identity did not match the Experience Gateway binding.");
  }
}

function validateScopeAndPolicy(session, claims) {
  const scope = record(session.scopeBinding);
  const policy = record(session.policyBinding);
  if (
    !scope ||
    !exactFields(
      scope,
      new Set([
        "tenantId",
        "workspaceId",
        "selectionOwner",
        "clientControlled",
        "exactRuntimeMatch",
      ]),
    ) ||
    scope.tenantId !== claims.tenantId ||
    scope.workspaceId !== claims.workspaceId ||
    scope.selectionOwner !== "server_registration_and_runtime" ||
    scope.clientControlled !== false ||
    scope.exactRuntimeMatch !== true ||
    !policy ||
    !exactFields(
      policy,
      new Set([
        "policyId",
        "policyVersion",
        "policyDigest",
        "state",
        "clientControlled",
      ]),
    ) ||
    policy.policyId !== claims.policyId ||
    policy.policyVersion !== claims.policyVersion ||
    policy.policyDigest !== claims.policyDigest ||
    policy.state !== "current_verified" ||
    policy.clientControlled !== false
  ) {
    invalid("Runtime scope or policy binding did not match the server registration.");
  }
}

function validateAssertionBinding(value, config) {
  const binding = record(value);
  if (
    !binding ||
    !exactFields(
      binding,
      new Set([
        "contractVersion",
        "algorithm",
        "keyId",
        "issuer",
        "audience",
        "serviceBindingId",
        "maximumLifetimeSeconds",
        "singleUseRequired",
        "tokenRetained",
        "authorityClaimAccepted",
      ]),
    ) ||
    binding.contractVersion !== HUMAN_SESSION_ASSERTION_CONTRACT ||
    binding.algorithm !== HUMAN_SESSION_ASSERTION_ALGORITHM ||
    binding.keyId !== config.humanSessionAssertionKeyId ||
    binding.issuer !== config.humanSessionAssertionIssuer ||
    binding.audience !== config.humanSessionAssertionAudience ||
    binding.serviceBindingId !== config.humanSessionServiceBindingId ||
    binding.maximumLifetimeSeconds !== 60 ||
    binding.singleUseRequired !== true ||
    binding.tokenRetained !== false ||
    binding.authorityClaimAccepted !== false
  ) {
    invalid("Runtime assertion binding did not match the Mission 3 trust contract.");
  }
}

function validateLifecycle(session, claims, config, expectedState) {
  const lifecycle = record(session.lifecycle);
  const replay = record(session.replayAndRevocation);
  const expectedRevoked = expectedState === "revoked";
  const registrations = Array.isArray(config.executiveRegistrations)
    ? config.executiveRegistrations
    : config.executiveRegistrations?.principals;
  const registration = Array.isArray(registrations)
    ? registrations.find(
        (item) => item?.registrationId === claims.registrationId,
      )
    : null;
  if (
    !lifecycle ||
    !exactFields(
      lifecycle,
      new Set([
        "sessionVersion",
        "authenticatedAt",
        "issuedAt",
        "expiresAt",
        "revokedAt",
        "maximumSessionLifetimeSeconds",
        "bounded",
      ]),
    ) ||
    lifecycle.sessionVersion !== claims.sessionVersion ||
    !timestampEquals(lifecycle.authenticatedAt, claims.authenticationTime) ||
    !timestampEquals(lifecycle.issuedAt, claims.sessionIssuedAt) ||
    !timestampEquals(lifecycle.expiresAt, claims.sessionExpiresAt) ||
    (expectedRevoked
      ? typeof lifecycle.revokedAt !== "string" ||
        Number.isNaN(Date.parse(lifecycle.revokedAt))
      : lifecycle.revokedAt !== null) ||
    !record(registration) ||
    lifecycle.maximumSessionLifetimeSeconds !==
      registration.maximumSessionLifetimeSeconds ||
    lifecycle.maximumSessionLifetimeSeconds <
      claims.sessionExpiresAt - claims.sessionIssuedAt ||
    lifecycle.bounded !== true ||
    !replay ||
    !exactFields(
      replay,
      new Set([
        "assertionReplayState",
        "sessionReplayRef",
        "revocationState",
        "revocationCheckpoint",
        "durable",
        "rejectedRequestMutatedState",
      ]),
    ) ||
    replay.assertionReplayState !== "admitted_single_use" ||
    typeof replay.sessionReplayRef !== "string" ||
    !IDENTIFIER.test(replay.sessionReplayRef) ||
    replay.revocationState !== expectedState ||
    replay.revocationCheckpoint !==
      claims.revocationCheckpoint + (expectedRevoked ? 1 : 0) ||
    replay.durable !== true ||
    replay.rejectedRequestMutatedState !== false
  ) {
    invalid("Runtime session lifecycle or replay/revocation state was invalid.");
  }
}

function validateAuthorityAndReceipt(session) {
  const boundary = record(session.authorityBoundary);
  const receipt = record(session.receipt);
  if (
    !boundary ||
    !exactFields(
      boundary,
      new Set([
        "authorityGranted",
        "actionAuthorized",
        "approvalRef",
        "decisionRef",
        "authorityGrantRefs",
        "missionExecutionAdmitted",
        "capabilityHealthGrantsAuthority",
      ]),
    ) ||
    boundary.authorityGranted !== false ||
    boundary.actionAuthorized !== false ||
    boundary.approvalRef !== null ||
    boundary.decisionRef !== null ||
    !sameArray(boundary.authorityGrantRefs, []) ||
    boundary.missionExecutionAdmitted !== false ||
    boundary.capabilityHealthGrantsAuthority !== false ||
    !receipt ||
    !exactFields(
      receipt,
      new Set([
        "receiptId",
        "receiptDigest",
        "accountabilityRef",
        "replayRef",
        "postconditionVerified",
        "credentialMaterialRetained",
        "rawProviderSubjectRetained",
      ]),
    ) ||
    typeof receipt.receiptId !== "string" ||
    !IDENTIFIER.test(receipt.receiptId) ||
    !DIGEST.test(receipt.receiptDigest) ||
    typeof receipt.accountabilityRef !== "string" ||
    !IDENTIFIER.test(receipt.accountabilityRef) ||
    typeof receipt.replayRef !== "string" ||
    !IDENTIFIER.test(receipt.replayRef) ||
    receipt.postconditionVerified !== true ||
    receipt.credentialMaterialRetained !== false ||
    receipt.rawProviderSubjectRetained !== false
  ) {
    invalid("Runtime Authority boundary or accountability receipt was invalid.");
  }
}

export function validateRuntimeExecutiveSessionEnvelope(
  value,
  claims,
  config,
  expectedState,
  expectedStatus,
) {
  const envelope = record(value);
  if (
    !envelope ||
    envelope.status !== expectedStatus ||
    typeof envelope.timestamp !== "string" ||
    Number.isNaN(Date.parse(envelope.timestamp)) ||
    envelope.schemaVersion !== "1.0.0" ||
    String(envelope.runtimeVersion).split(".").slice(0, 2).join(".") !==
      "0.1" ||
    !Array.isArray(envelope.proofIds) ||
    !Array.isArray(envelope.limitations) ||
    envelope.secretValuesExposed !== false ||
    !record(envelope.data)
  ) {
    invalid("Runtime returned an incompatible Registered Executive session envelope.");
  }
  const session = record(envelope.data.session);
  if (
    !session ||
    !exactFields(session, ROOT_FIELDS) ||
    session.recordType !== "nexus_registered_executive_session" ||
    session.schemaVersion !== REGISTERED_EXECUTIVE_SESSION_CONTRACT ||
    session.sessionId !== claims.sid ||
    !SESSION_ID.test(session.sessionId) ||
    session.state !== expectedState ||
    session.role !== claims.role ||
    session.role !== "executive" ||
    !sameArray(session.scopes, claims.scopes) ||
    !sameArray(session.scopes, EXECUTIVE_SCOPES) ||
    session.secretValuesExposed !== false
  ) {
    invalid("Runtime returned an incompatible Registered Executive session record.");
  }
  validateHumanIdentity(session.humanIdentity, claims);
  validateServiceIdentity(session.serviceIdentity, config, claims);
  validateScopeAndPolicy(session, claims);
  validateAssertionBinding(session.assertionBinding, config);
  validateLifecycle(session, claims, config, expectedState);
  validateAuthorityAndReceipt(session);
  return session;
}

function publicRuntimeSession(session) {
  return JSON.parse(JSON.stringify(session));
}

export function createExecutiveSessionRuntimeClient(
  config,
  {
    runtimeFetch = globalThis.fetch,
    clock = () => Date.now(),
  } = {},
) {
  const call = async (
    method,
    path,
    claims,
    expectedState,
    expectedStatus,
    body,
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const assertion = createHumanSessionAssertion(
        config,
        claims,
        clock,
      );
      let response;
      try {
        response = await runtimeFetch(`${config.runtimeBaseUrl}${path}`, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.runtimeToken}`,
            [HUMAN_SESSION_ASSERTION_HEADER]: assertion,
            ...(method === "POST"
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === "AbortError" || controller.signal.aborted) {
          throw new ExecutiveSessionRuntimeFailure(
            "executive_session_runtime_timed_out",
            "Registered Executive session verification timed out.",
            504,
          );
        }
        throw new ExecutiveSessionRuntimeFailure(
          "executive_session_runtime_unavailable",
          "Registered Executive session verification is unavailable.",
          503,
        );
      }
      let raw;
      try {
        raw = await readBoundedRuntimeBody(response);
      } catch (error) {
        if (error instanceof ExecutiveSessionRuntimeFailure) throw error;
        throw new ExecutiveSessionRuntimeFailure(
          "executive_session_runtime_response_invalid",
          "Registered Executive session response was invalid.",
          502,
        );
      }
      let responseBody;
      try {
        responseBody = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new ExecutiveSessionRuntimeFailure(
          "executive_session_runtime_response_invalid",
          "Registered Executive session response was invalid.",
          502,
        );
      }
      if (response.status !== expectedStatus) {
        const reasonCode = String(
          responseBody?.data?.reasonCode ?? "executive_session_runtime_rejected",
        );
        throw new ExecutiveSessionRuntimeFailure(
          IDENTIFIER.test(reasonCode)
            ? reasonCode
            : "executive_session_runtime_rejected",
          "The Runtime rejected the Registered Executive session.",
          [400, 401, 403, 404, 409, 503].includes(response.status)
            ? response.status
            : 502,
        );
      }
      const returnedState = responseBody?.data?.session?.state;
      if (
        expectedState === "active" &&
        (returnedState === "expired" || returnedState === "revoked")
      ) {
        throw new ExecutiveSessionRuntimeFailure(
          returnedState === "expired" ? "session_expired" : "session_revoked",
          `The Registered Executive session is ${returnedState}.`,
          409,
        );
      }
      return publicRuntimeSession(
        validateRuntimeExecutiveSessionEnvelope(
          responseBody,
          claims,
          config,
          expectedState,
          expectedStatus === 201
            ? "executive_session_verified"
            : expectedState === "revoked"
              ? "executive_session_revoked"
              : "ok",
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  };
  return Object.freeze({
    verify: (claims) =>
      call(
        "POST",
        "/runtime/executive-sessions/verify",
        claims,
        "active",
        201,
        {},
      ),
    get: (claims) =>
      call(
        "GET",
        `/runtime/executive-sessions/${encodeURIComponent(claims.sid)}`,
        claims,
        "active",
        200,
        undefined,
      ),
    revoke: (claims) =>
      call(
        "POST",
        `/runtime/executive-sessions/${encodeURIComponent(claims.sid)}/revoke`,
        claims,
        "revoked",
        200,
        { reason: "user_requested_session_revocation" },
      ),
  });
}
