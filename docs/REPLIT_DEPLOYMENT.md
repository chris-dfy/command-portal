# Hosted Portal Deployment

This deployment follows the boundaries defined by the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

Configure these server-only secrets and variables in the hosting environment:

- `COMMAND_PORTAL_RUNTIME_API_BASE_URL=https://nexus-runtime-dev.fly.dev`
- `COMMAND_PORTAL_RUNTIME_READ_TOKEN` as a scoped server secret
- `NEXUS_CONTEXT_ASSERTION_SECRET` as the same randomly generated, minimum-32-character secret stored in the Runtime secret manager
- `COMMAND_PORTAL_CONTEXT_PRINCIPAL_ID=command-portal-observer` as a non-human service principal used only when no authenticated operational session is present
- `COMMAND_PORTAL_REQUEST_TIMEOUT_MS=8000`
- `COMMAND_PORTAL_REASONING_TIMEOUT_MS=35000`
- `COMMAND_PORTAL_CACHE_TTL_MS=15000`
- `COMMAND_PORTAL_MAX_RESPONSE_BYTES=1048576`

The general 1 MiB response limit remains unchanged. The exact
`/api/runtime/capability-registry` read has an isolated 4 MiB ceiling because
the measured compact canonical projection exceeds 1 MiB; this exception is
not configurable and does not apply to any other route.

To enable the fixed-workspace Hosted Operational Gateway, publish the app as a **Workspace only** private deployment, provision every server-only operational variable from `.env.example`, deploy the execution Runtime behind HTTPS, and provision the matching Runtime token, tenant, workspace, and fixed service bindings:

- `NEXUS_HOSTED_OPERATIONAL_TOKEN` matches `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN`;
- `NEXUS_HOSTED_TENANT_ID` matches `COMMAND_PORTAL_TENANT_ID`;
- `NEXUS_HOSTED_WORKSPACE_ID` matches `COMMAND_PORTAL_WORKSPACE_ID`;
- `NEXUS_HOSTED_SERVICE_ID` matches `COMMAND_PORTAL_OPERATOR_USER_ID`;
- `NEXUS_HOSTED_SERVICE_ROLE` matches `COMMAND_PORTAL_OPERATOR_ROLE`; and
- `NEXUS_HOSTED_SERVICE_SCOPES` matches `COMMAND_PORTAL_OPERATIONAL_SCOPES` using the same comma-separated values.

Published Replit deployments select the automatic workspace-session contract from Replit's predefined `REPLIT_DEPLOYMENT=1` marker and require the exact `REPLIT_DOMAINS` binding, HTTPS, and a same-origin browser request. The browser receives only a signed HttpOnly session cookie and CSRF token; it never receives or submits an operator access key. Non-Replit development retains the explicit `access_key` compatibility mode.

Never enable operational mode while any ingress or fixed-binding value is absent or mismatched. This is a fixed workspace-service compatibility boundary, not individual human identity, enterprise identity, multi-user RBAC, or an Authority Grant. `productionMultiTenantReady` remains `false`.

Build with `npm run build` and start with `npm run start`. Never create a browser-visible `VITE_` runtime variable. After deployment, verify every allowlisted route, mutation rejection, secret isolation, failure rendering, and the live topology.

Deploy in this order: first add the assertion secret to this portal and republish it so text and voice already carry the signed header; then deploy Runtime with the provisioned tenant registry, the matching secret, and assertion verification. The earlier Runtime safely ignores the additional header. Rotating the assertion secret requires coordinated dual-secret support or a bounded maintenance window; changing only one side after verification is active will correctly fail closed.
