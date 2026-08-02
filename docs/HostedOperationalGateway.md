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

The exact allowlist includes the canonical `POST /executive/interactions` route, capability readiness, the versioned Runtime Client Capability Contract, Missions, Conclave, Operational Replay, Knowledge, Runtime Coordination, Document Intelligence, and Projects. Document upload requires `evidence:write`; canonical interactions and other workspace mutations require `operations:write`. Realtime SDP negotiation remains an exact `/api/runtime` transport route and requires the same signed session and CSRF proof. Finalized voice transcripts do not use that transport as a reasoning side channel; they re-enter through `/executive/interactions`.

The browser cannot send `actor`, tenant, role, scope, Authority, verification, or workspace bindings. For canonical interaction admission, the gateway constructs the required `actor` object and `context.workspace_id` from the authenticated session, forwards corroborating `X-NEXUS-*` identity headers, and emits a single-use HMAC-signed `nexus.context-assertion@3.0.0`. Runtime verifies its signature, issuer/client allowlists, audience, lifetime, `jti`, tenant/workspace, actor, role, and scopes before Authority. `Idempotency-Key` must exactly equal `interaction_id`.

The bearer credential identifies the gateway transport principal; it never substitutes for the asserted human. Automatic private-workspace compatibility sessions are rejected from canonical interaction and approval routes. This alpha remains fixed-tenant and single named operator; it is not production multi-tenant identity.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_SERVICE_ID=nexus-workspace-service
NEXUS_CONTEXT_ASSERTION_SECRET=<same HMAC secret as the portal>
NEXUS_CONTEXT_ASSERTION_ISSUERS=command-portal-experience-gateway
NEXUS_CONTEXT_ASSERTION_CLIENT_IDS=nexus-web
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

When enabled, Runtime verifies the bearer transport credential and then independently verifies the v3 human assertion. The assertion issuer/client must be explicitly allowlisted and all corroborating identity headers/body fields must match. Replayed, expired, future-dated, mismatched, or invalid assertions fail closed. Runtime records secret-free admission outcomes. `/health` remains liveness only.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`, provision the shared assertion secret on both servers, and configure Runtime's explicit issuer/client allowlists. The operational Runtime URL must use HTTPS except in loopback test/development environments.

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
