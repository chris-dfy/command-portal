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

To enable the single-workspace Hosted Operational Gateway, provision every server-only operational variable from `.env.example`, deploy the execution Runtime behind HTTPS, and provision the matching Runtime token, tenant, workspace, and fixed service bindings:

- `NEXUS_HOSTED_OPERATIONAL_TOKEN` matches `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN`;
- `NEXUS_HOSTED_TENANT_ID` matches `COMMAND_PORTAL_TENANT_ID`;
- `NEXUS_HOSTED_WORKSPACE_ID` matches `COMMAND_PORTAL_WORKSPACE_ID`;
- `NEXUS_HOSTED_SERVICE_ID` matches `COMMAND_PORTAL_OPERATOR_USER_ID`;
- `NEXUS_HOSTED_SERVICE_ROLE` matches `COMMAND_PORTAL_OPERATOR_ROLE`; and
- `NEXUS_HOSTED_SERVICE_SCOPES` matches `COMMAND_PORTAL_OPERATIONAL_SCOPES` using the same comma-separated values.

Never enable operational mode while any ingress or fixed-binding value is absent or mismatched. This is a fixed single-operator compatibility boundary, not enterprise identity, multi-user RBAC, or an Authority Grant. `productionMultiTenantReady` remains `false`.

Build with `npm run build` and start with `npm run start`. Never create a browser-visible `VITE_` runtime variable. After deployment, verify every allowlisted route, mutation rejection, secret isolation, failure rendering, and the live topology.

Deploy in this order: first add the assertion secret to this portal and republish it so text and voice already carry the signed header; then deploy Runtime with the provisioned tenant registry, the matching secret, and assertion verification. The earlier Runtime safely ignores the additional header. Rotating the assertion secret requires coordinated dual-secret support or a bounded maintenance window; changing only one side after verification is active will correctly fail closed.
