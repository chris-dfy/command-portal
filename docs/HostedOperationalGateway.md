# Hosted Operational Gateway

The Hosted Operational Gateway is the authenticated operational lane of the NEXUS Experience Gateway. It is separate from the `/api/runtime` hosted observation and bounded interaction lanes.

## Current classification

The implemented phase is a **private, fixed-workspace hosted alpha**. Replit's private-deployment boundary authenticates and admits workspace users before the app is reachable. The NEXUS Experience Gateway then issues the browser a signed workspace session automatically; users do not enter or receive an infrastructure credential. This provides meaningful remote-operation security but is not production multi-tenant identity. The current session identifies a bounded workspace service principal rather than a distinct human account.

## Request path

```text
Browser
  -> Replit private-deployment admission
  -> same-origin automatic HttpOnly workspace session
  -> /api/operations exact allowlist
  -> CSRF + scope + idempotency validation
  -> NEXUS Experience Gateway server credential
  -> HTTPS
  -> NEXUS execution Runtime hosted ingress policy
  -> fixed tenant/workspace binding + role enforcement
  -> Runtime handler, governance, proof, and receipt
```

The browser never receives the Runtime bearer token, session-signing secret, or an operator access key. Session state is signed and stored in an HttpOnly, SameSite=Strict, Secure cookie. Automatic issuance requires Replit's deployment marker, an exact configured Replit domain, HTTPS, and a same-origin browser request. Mutations require a session-derived CSRF token and an idempotency key. The gateway forwards deployment-fixed identity, tenant, workspace, role, scope, and request identifiers. Browser-supplied NEXUS identity, role, or scope headers are never forwarded. Arbitrary paths and browser query parameters are rejected.

The exact allowlist includes capability readiness, the versioned Runtime Client Capability Contract, Missions, Conclave, Operational Replay, Knowledge, Runtime Coordination, Document Intelligence, Projects, and Voice Operator. Document upload requires `evidence:write`; other workspace mutations require `operations:write`. The Human Interaction Framework and Realtime SDP exchange remain exact `/api/runtime` routes, but in hosted operational mode they require the same signed session and CSRF proof before the gateway contacts Runtime.

In this alpha, the portal's `nexus-workspace-service` principal is also the fixed Runtime ingress identity. Replit workspace membership controls who may reach the private app; it does not enlarge the NEXUS service principal's access scope and never creates an Authority Grant. The default automatic session omits Action execution, approval decision, Knowledge Promotion, and Edge admission review scopes. This is not enterprise identity, individual human attribution, multi-user RBAC, or an Authority Grant.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_SERVICE_ID=nexus-workspace-service
NEXUS_HOSTED_SERVICE_ROLE=operator
NEXUS_HOSTED_SERVICE_SCOPES=operations:read,operations:write,actions:simulate,evidence:write,edge:node_admission:request
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

The service bindings must exactly match the portal deployment:

- `NEXUS_HOSTED_SERVICE_ID` equals `COMMAND_PORTAL_OPERATOR_USER_ID`;
- `NEXUS_HOSTED_SERVICE_ROLE` equals `COMMAND_PORTAL_OPERATOR_ROLE`; and
- `NEXUS_HOSTED_SERVICE_SCOPES` equals `COMMAND_PORTAL_OPERATIONAL_SCOPES` using the same comma-separated values.

When enabled, the Runtime verifies the bearer token and requires the request's tenant, workspace, fixed identity, and role to match those server-side bindings. The Runtime supplies the configured scopes rather than trusting forwarded scope claims, and it requires mutation idempotency keys. A missing or mismatched binding fails closed. It writes a secret-free audit record for allowed and rejected requests. `/health` remains available for deployment health checks.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`, then configure the matching `NEXUS_HOSTED_SERVICE_*` values on the execution Runtime. The operational Runtime URL must use HTTPS except in loopback test/development environments.

On a published Replit deployment, `REPLIT_DEPLOYMENT=1` selects `automatic_private_workspace`. Replit supplies `REPLIT_DOMAINS`; NEXUS refuses automatic issuance if the request is not HTTPS, same-origin, and bound to one of those domains. The deployment itself must remain private and be configured as **Workspace only**. The legacy `access_key` mode remains available only for non-Replit development and compatibility testing; the published browser contains no key form or key-login request.

## Remaining production gates

- Add application-level verified human identity and preserve both the Replit/private-ingress actor and gateway service principal in Authority, Decision, proof, receipt, and audit records.
- Bind Runtime records, retrieval, proof, receipts, connectors, and storage physically to tenant/workspace identifiers.
- Add persistent distributed session revocation and rate limiting.
- Add a durable idempotency-result store rather than request-key enforcement alone.
- Add durable gateway audit export and alerting.
- Deploy and verify the execution Runtime behind HTTPS.
- Complete penetration, isolation, backup/restore, and operator acceptance evidence.

Until those gates pass, `productionMultiTenantReady` remains `false` in operational responses.
