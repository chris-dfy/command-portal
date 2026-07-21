# Hosted Operational Gateway

The Hosted Operational Gateway is the authenticated mutation lane of the NEXUS Experience Gateway. It is separate from the existing `/api/runtime` hosted observation lane, which remains read-only by design.

## Current classification

The implemented phase is a **single-workspace hosted alpha**. It provides meaningful remote-operation security but is not production multi-tenant readiness. External identity-provider login and verified tenant-scoped persistence are not yet implemented.

## Request path

```text
Browser
  -> same-origin authenticated session
  -> /api/operations exact allowlist
  -> CSRF + scope + idempotency validation
  -> NEXUS Experience Gateway server credential
  -> HTTPS
  -> NEXUS execution Runtime hosted ingress policy
  -> fixed tenant/workspace binding + role enforcement
  -> Runtime handler, governance, proof, and receipt
```

The browser never receives the Runtime bearer token or session-signing secret. Session state is signed and stored in an HttpOnly, SameSite=Strict cookie. Mutations require a session-derived CSRF token and an idempotency key. The gateway forwards deployment-fixed identity, tenant, workspace, role, scope, and request identifiers. Browser-supplied NEXUS identity, role, or scope headers are never forwarded. Arbitrary paths and browser query parameters are rejected.

In this alpha, the portal's operator identity is also the fixed Runtime ingress identity. This is a bounded single-operator compatibility arrangement, not a distinct gateway service principal, enterprise identity, multi-user RBAC, or an Authority Grant.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_SERVICE_ID=operator-alpha
NEXUS_HOSTED_SERVICE_ROLE=admin
NEXUS_HOSTED_SERVICE_SCOPES=operations:read,operations:write,actions:simulate,actions:execute,approvals:decide,evidence:write
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

The service bindings must exactly match the portal deployment:

- `NEXUS_HOSTED_SERVICE_ID` equals `COMMAND_PORTAL_OPERATOR_USER_ID`;
- `NEXUS_HOSTED_SERVICE_ROLE` equals `COMMAND_PORTAL_OPERATOR_ROLE`; and
- `NEXUS_HOSTED_SERVICE_SCOPES` equals `COMMAND_PORTAL_OPERATIONAL_SCOPES` using the same comma-separated values.

When enabled, the Runtime verifies the bearer token and requires the request's tenant, workspace, fixed identity, and role to match those server-side bindings. The Runtime supplies the configured scopes rather than trusting forwarded scope claims, and it requires mutation idempotency keys. A missing or mismatched binding fails closed. It writes a secret-free audit record for allowed and rejected requests. `/health` remains available for deployment health checks.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`, then configure the matching `NEXUS_HOSTED_SERVICE_*` values on the execution Runtime. The operational Runtime URL must use HTTPS except in loopback test/development environments. The access key is a temporary single-operator bootstrap mechanism; it must be randomly generated and stored only in the hosting platform's secret manager.

## Remaining production gates

- Replace the bootstrap key with verified OIDC/Supabase/Entra login.
- Separate the gateway service principal from the authenticated human actor while preserving both identities in Authority, Decision, proof, receipt, and audit records.
- Bind Runtime records, retrieval, proof, receipts, connectors, and storage physically to tenant/workspace identifiers.
- Add persistent distributed session revocation and rate limiting.
- Add a durable idempotency-result store rather than request-key enforcement alone.
- Add durable gateway audit export and alerting.
- Deploy and verify the execution Runtime behind HTTPS.
- Complete penetration, isolation, backup/restore, and operator acceptance evidence.

Until those gates pass, `productionMultiTenantReady` remains `false` in operational responses.
