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

The browser never receives the Runtime bearer token or session-signing secret. Session state is signed and stored in an HttpOnly, SameSite=Strict cookie. Mutations require a session-derived CSRF token and an idempotency key. The gateway forwards fixed identity, tenant, workspace, role, scope, and request identifiers. Arbitrary paths and browser query parameters are rejected.

## Runtime ingress

The execution Runtime enables hosted ingress enforcement only when `NEXUS_HOSTED_OPERATIONAL_TOKEN` is set. Configure the same value as `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN` at the portal. Also configure:

```text
NEXUS_HOSTED_TENANT_ID=nexicron
NEXUS_HOSTED_WORKSPACE_ID=primary
NEXUS_HOSTED_GATEWAY_AUDIT_PATH=data/team/hosted_gateway_audit.jsonl
```

When enabled, the Runtime verifies the bearer token, fixed tenant/workspace identity, role, request identity, and mutation idempotency key. It writes a secret-free audit record for allowed and rejected requests. `/health` remains available for deployment health checks.

## Portal configuration

Set every `COMMAND_PORTAL_OPERATIONAL_*` value documented in `.env.example`. The operational Runtime URL must use HTTPS except in loopback test/development environments. The access key is a temporary single-operator bootstrap mechanism; it must be randomly generated and stored only in the hosting platform's secret manager.

## Remaining production gates

- Replace the bootstrap key with verified OIDC/Supabase/Entra login.
- Bind Runtime records, retrieval, proof, receipts, connectors, and storage physically to tenant/workspace identifiers.
- Add persistent distributed session revocation and rate limiting.
- Add a durable idempotency-result store rather than request-key enforcement alone.
- Add durable gateway audit export and alerting.
- Deploy and verify the execution Runtime behind HTTPS.
- Complete penetration, isolation, backup/restore, and operator acceptance evidence.

Until those gates pass, `productionMultiTenantReady` remains `false` in operational responses.
