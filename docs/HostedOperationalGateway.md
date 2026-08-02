# Hosted Operational Gateway

The Hosted Operational Gateway is the authenticated operational lane of the NEXUS Experience Gateway. It is separate from the `/api/runtime` hosted observation and bounded interaction lanes.

## Current classification

The implemented phase is a **private, fixed-workspace hosted alpha**. Human interaction requires an explicit named-operator login. Replit's private-deployment boundary is defense in depth; it is not treated as human identity or approval authority. The gateway binds the named operator to a signed session and to a short-lived Runtime assertion.

## Request path

```text
Browser
  -> Replit private-deployment admission
  -> explicit named-operator login
  -> same-origin HttpOnly operator session
  -> /api/operations exact allowlist
  -> CSRF + scope + idempotency validation
  -> bearer transport credential + signed human assertion
  -> HTTPS
  -> NEXUS execution Runtime hosted ingress policy
  -> tenant/workspace binding + actor role/scope enforcement
  -> Runtime handler, governance, proof, and receipt
```

The browser never receives the Runtime bearer token or session/assertion signing secrets. The operator access key is exchanged once and is not persisted by the browser. Session state is signed and stored in an HttpOnly, SameSite=Strict, Secure cookie. Mutations require a session-derived CSRF token and an idempotency key. Browser-supplied NEXUS identity, role, scope, and Authority fields are rejected.

The exact allowlist includes authenticated capability and domain reads, the canonical `POST /executive/interactions` route, and exact approval `approve` or `deny` decisions. Canonical interaction admission requires `operations:read`; the Runtime—not browser code or browser scope—classifies whether the request is informational, requires approval, or is eligible for governed action. Every other domain POST under `/api/operations/*` is retired with `410 canonical_interaction_required` before Runtime contact. Portal controls for Mission, Work Session, Conclave, Knowledge, Runtime Admission, Document, and Project actions all enter the coordinator.

Realtime SDP negotiation remains an exact `/api/runtime/realtime/call` transport route and requires the same signed session and CSRF proof. The Portal admits that transport only when Runtime reports the exact manual-commit status contract (`serverVAD=false`, `clientAudioCommitRequired=true`, and `inputAudioCommitEvent=input_audio_buffer.commit`) and the same SDP response independently carries `X-NEXUS-Realtime-Input-Mode: client-audio-commit-v1`; the status read cannot substitute for this per-call attestation. A bounded analyser-driven speech envelope sends one audio-buffer commit for one serialized turn, disables the microphone track until that turn reaches a terminal Runtime disposition, and binds the resulting committed provider item to that turn's one idempotency key. Finalized voice transcripts do not use the provider transport as a reasoning side channel; they re-enter through `/executive/interactions`, and only a semantically validated Runtime response may be presented or narrated. An admitted interaction cannot be superseded by later acoustic samples or invalidated by closing WebRTC. If a canonical POST response is uncertain, the Portal reconciles `GET /executive/interactions/{interaction_id}` and permits at most a same-key resubmission after a verified not-found lookup; a retained nonterminal interaction blocks every new UUID and is reported as indeterminate/do-not-retry. Executed, approval-required, blocked, and failed claims are admitted only with matching Authority, execution scope/state, verification state, and durable receipt evidence. Server-VAD and provider-response events fail closed. Session and provider-auth POSTs remain identity lifecycle only. Browser-selected attachment bytes remain browser-local until a governed canonical attachment transport is defined; a requested intake cannot be represented as completed without Runtime proof, receipt, and verified postconditions.

The former Mission 4 canonical-execution fixture is retained only as authenticated, read-only status and historical Mission evidence. Its Portal Mission-creation and Action endpoints return `410 canonical_interaction_required` without forwarding. They are not an internal execution back door: the browser client exposes no mutation method, and new typed, spoken, or API intent must enter `POST /executive/interactions`.

The browser cannot send `actor`, tenant, role, scope, Authority, verification, or workspace bindings. For canonical interaction admission, the gateway constructs the required `actor` object and `context.workspace_id` from the authenticated session, forwards corroborating `X-NEXUS-*` identity headers, and emits a single-use HMAC-signed `nexus.context-assertion@3.0.0`. Runtime verifies its signature, issuer/client allowlists, audience, lifetime, `jti`, tenant/workspace, actor, role, and scopes before Authority. `Idempotency-Key` must exactly equal `interaction_id`.

The bearer credential identifies the gateway transport principal; it never substitutes for the asserted human. Automatic private-workspace compatibility sessions are rejected from canonical interaction and approval routes. This alpha remains fixed-tenant and single named operator; it is not production multi-tenant identity.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_SERVICE_ID=nexus-workspace-service
NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET=<same Command Portal-only HMAC secret as the portal>
NEXUS_CONTEXT_ASSERTION_ISSUERS=command-portal-experience-gateway
NEXUS_CONTEXT_ASSERTION_CLIENT_IDS=nexus-web
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

When enabled, Runtime verifies the bearer transport credential and then independently verifies the v3 human assertion. The assertion issuer/client must be explicitly allowlisted and all corroborating identity headers/body fields must match. Replayed, expired, future-dated, mismatched, or invalid assertions fail closed. Runtime records secret-free admission outcomes. `/health` remains liveness only.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`, provision the Command Portal-only assertion secret on both servers under key ID `context-assertion-command-portal-v1`, and configure Runtime's explicit issuer/client allowlists. The operational Runtime URL must use HTTPS except in loopback test/development environments.

Published human-interaction deployments use `access_key` and issue a session only after an explicit named-operator login. Replit private ingress may add a network boundary, but it is not a human identity and cannot mint execution or approval authority. Automatic private-workspace sessions remain read-only compatibility sessions and are rejected from `/executive/interactions` and approval decisions.

## Remaining production gates

- Replace the single named-operator bootstrap with enterprise multi-user identity before multi-tenant rollout.
- Bind Runtime records, retrieval, proof, receipts, connectors, and storage physically to tenant/workspace identifiers.
- Add persistent distributed session revocation and rate limiting.
- Add a durable idempotency-result store rather than request-key enforcement alone.
- Add durable gateway audit export and alerting.
- Deploy and verify the execution Runtime behind HTTPS.
- Complete penetration, isolation, backup/restore, and operator acceptance evidence.

Until those gates pass, `productionMultiTenantReady` remains `false` in operational responses.
