# Hosted Portal Deployment

This deployment follows the boundaries defined by the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

Configure these server-only secrets and variables in the hosting environment:

- `COMMAND_PORTAL_RUNTIME_API_BASE_URL=https://nexus-runtime-dev.fly.dev`
- `COMMAND_PORTAL_RUNTIME_READ_TOKEN` as a scoped server secret
- `COMMAND_PORTAL_REQUEST_TIMEOUT_MS=8000`
- `COMMAND_PORTAL_CACHE_TTL_MS=15000`
- `COMMAND_PORTAL_MAX_RESPONSE_BYTES=1048576`

To enable the single-workspace Hosted Operational Gateway, provision every server-only operational variable from `.env.example`, deploy the execution Runtime behind HTTPS, and provision the matching `NEXUS_HOSTED_OPERATIONAL_TOKEN`, tenant ID, and workspace ID in that Runtime. Never enable operational mode while the Runtime ingress token or fixed workspace binding is absent.

Build with `npm run build` and start with `npm run start`. Never create a browser-visible `VITE_` runtime variable. After deployment, verify every allowlisted route, mutation rejection, secret isolation, failure rendering, and the live topology.
