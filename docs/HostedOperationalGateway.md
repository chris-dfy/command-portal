# Hosted Operational Gateway

The Hosted Operational Gateway is the authenticated operational lane of the NEXUS Experience Gateway. It is separate from the `/api/runtime` hosted observation and bounded interaction lanes.

## Current classification

The implemented phase is a **private, fixed-workspace development alpha**. Replit's private-deployment boundary admits workspace users before the app is reachable. The Experience Gateway then establishes a reduced, signed workspace-service session automatically so ordinary build-time workspaces are usable without distributing an infrastructure credential. This session is not human identity, approval, or operational Authority.

## Request path

```text
Browser
  -> Replit private-deployment admission
  -> same-origin automatic HttpOnly workspace-service session
  -> /api/operations exact allowlist
  -> CSRF + scope + idempotency validation
  -> bearer transport credential
  -> HTTPS
  -> NEXUS execution Runtime hosted ingress policy
  -> fixed tenant/workspace/service binding + scope enforcement
  -> Runtime handler, governance, proof, and receipt
```

The browser never receives the Runtime bearer token, session/assertion signing secrets, or an operator access key. Session state is signed and stored in an HttpOnly, SameSite=Strict, Secure cookie. Automatic issuance requires Replit's deployment marker, an exact configured Replit domain, HTTPS, and a same-origin browser request. Mutations require a session-derived CSRF token and an idempotency key. Browser-supplied NEXUS identity, role, scope, and Authority fields are rejected.

The exact allowlist includes authenticated capability and domain reads, the canonical `POST /executive/interactions` route, and exact approval `approve` or `deny` decisions. The reduced workspace-service session admits the read side of that allowlist and the separately bounded Realtime transport. Its scopes cover operations read/write, repository metadata read, Evidence write, and Edge admission request, but intentionally omit approval decision, Action execution, Knowledge Promotion, and Edge admission review. The presence of a write-labelled scope does not admit a browser mutation by itself.

Canonical interaction and approval decisions remain named-human boundaries. The gateway rejects the automatic workspace-service principal from those routes before forwarding. Every other domain POST under `/api/operations/*` is retired with `410 canonical_interaction_required` before Runtime contact, so Portal controls for Mission, Work Session, Conclave, Knowledge, Runtime Admission, Document, and Project actions enter the coordinator only after a separately verified human session is available. A blocked human-only function does not revoke or hide the bounded development session used for authenticated workspace reads.

Realtime SDP negotiation remains an exact `/api/runtime/realtime/call` transport route and requires the same signed session and CSRF proof. The Portal admits that transport only when Runtime reports the exact ordered-PCM contract (`serverVAD=false`, `clientAudioAppendRequired=true`, `inputAudioAppendEvent=input_audio_buffer.append`, `clientAudioCommitRequired=true`, `inputAudioCommitEvent=input_audio_buffer.commit`, `providerOfferAudioDirection=inactive`, `providerOfferAudioTrackAttached=false`, and `rtpAudioNegotiated=false`) and the same SDP response independently carries `X-NEXUS-Realtime-Input-Mode: client-pcm-append-commit-v1`; the status read cannot substitute for this per-call attestation. The provider requires an audio media section in the WebRTC offer, so the browser creates exactly one inactive, trackless audio transceiver alongside the ordered data channel. It never attaches the captured microphone stream to that transceiver, and Runtime rejects a missing, active, attached, duplicated, or data-channel-less offer before provider contact. A bounded analyser-driven speech envelope serializes clear, 24 kHz PCM16 appends, and one commit on that same reliable ordered channel, eliminating cross-transport commit races; the committed provider item remains bound to the turn's one idempotency key. Finalized voice transcripts do not use the provider transport as a reasoning side channel; they re-enter through `/executive/interactions`, so the automatic workspace-service session cannot submit them. Only a semantically validated Runtime response admitted through a separately verified human session may be presented or narrated. An admitted interaction cannot be superseded by later acoustic samples or invalidated by closing WebRTC. If a canonical POST response is uncertain, the Portal reconciles `GET /executive/interactions/{interaction_id}` and permits at most a same-key resubmission after a verified not-found lookup; a retained nonterminal interaction blocks every new UUID and is reported as indeterminate/do-not-retry. Executed, approval-required, blocked, and failed claims are admitted only with matching Authority, execution scope/state, verification state, and durable receipt evidence. Active provider RTP audio, an attached audio sender track, server-VAD, and provider-response events fail closed. Session and provider-auth POSTs remain identity lifecycle only. Browser-selected attachment bytes remain browser-local until a governed canonical attachment transport is defined; a requested intake cannot be represented as completed without Runtime proof, receipt, and verified postconditions.

The former Mission 4 canonical-execution fixture is retained only as authenticated, read-only status and historical Mission evidence. Its Portal Mission-creation and Action endpoints return `410 canonical_interaction_required` without forwarding. They are not an internal execution back door: the browser client exposes no mutation method, and new typed, spoken, or API intent must enter `POST /executive/interactions`.

The browser cannot send `actor`, tenant, role, scope, Authority, verification, or workspace bindings. When a separately verified human session becomes available for canonical interaction, the gateway constructs the required `actor` object and `context.workspace_id` from that server-owned session, forwards corroborating `X-NEXUS-*` identity headers, and emits a single-use HMAC-signed `nexus.context-assertion@3.0.0`. Runtime verifies its signature, issuer/client allowlists, audience, lifetime, `jti`, tenant/workspace, actor, role, and scopes before Authority. `Idempotency-Key` must exactly equal `interaction_id`.

The bearer credential identifies the gateway transport principal; it never substitutes for a human. Automatic private-workspace sessions are rejected from canonical interaction and approval routes. This alpha remains fixed-tenant and workspace-service scoped; it is not production multi-tenant identity.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_SERVICE_ID=nexus-workspace-service
NEXUS_HOSTED_SERVICE_ROLE=operator
NEXUS_HOSTED_SERVICE_SCOPES=edge:node_admission:request,evidence:write,operations:read,operations:write,repository:metadata:read
NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET=<same Command Portal-only HMAC secret as the portal>
NEXUS_CONTEXT_ASSERTION_ISSUERS=command-portal-experience-gateway
NEXUS_CONTEXT_ASSERTION_CLIENT_IDS=nexus-web
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

Runtime verifies the bearer transport credential and exact fixed workspace binding for ordinary bounded workspace operations. The scope string is canonicalized by the Gateway as a deduplicated lexicographically ordered list and the Runtime deployment must use that exact order; a mismatch fails closed. Human-only routes additionally require the v3 human assertion. The assertion issuer/client must be explicitly allowlisted and all corroborating identity headers/body fields must match. Replayed, expired, future-dated, mismatched, or invalid assertions fail closed. Runtime records secret-free admission outcomes. `/health` remains liveness only.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`, provision the Command Portal-only assertion secret on both servers under key ID `context-assertion-command-portal-v1`, and configure Runtime's explicit issuer/client allowlists. The operational Runtime URL must use HTTPS except in loopback test/development environments.

The published Replit development deployment uses `automatic_private_workspace`. Replit supplies `REPLIT_DEPLOYMENT` and `REPLIT_DOMAINS`; NEXUS refuses automatic issuance unless the request is HTTPS, same-origin, and bound to that exact private deployment. The issued service session carries only the reduced scopes listed above. Non-Replit development may retain `access_key` compatibility, but the published client contains no key form and never sends a key-login request. Neither mode creates Authority.

## Remaining production gates

- Provision and verify the Registered Executive session before enabling canonical human interaction or approval without an operator bootstrap credential.
- Replace the fixed workspace-service development boundary with enterprise multi-user identity before multi-tenant rollout.
- Bind Runtime records, retrieval, proof, receipts, connectors, and storage physically to tenant/workspace identifiers.
- Add persistent distributed session revocation and rate limiting.
- Add a durable idempotency-result store rather than request-key enforcement alone.
- Add durable gateway audit export and alerting.
- Deploy and verify the execution Runtime behind HTTPS.
- Complete penetration, isolation, backup/restore, and operator acceptance evidence.

Until those gates pass, `productionMultiTenantReady` remains `false` in operational responses.
