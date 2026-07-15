# Replit Deployment Handoff

## Import and build

1. Import the standalone `command-portal` repository into a new Replit application.
2. Confirm Node.js 20 is selected.
3. Build with `npm ci && npm run build`.
4. Run with `npm run start`; the server binds `0.0.0.0:$PORT`.

## Secrets

Configure these in Replit Secrets:

- `COMMAND_PORTAL_MODE=local_runtime`
- `COMMAND_PORTAL_RUNTIME_API_BASE_URL`
- `COMMAND_PORTAL_RUNTIME_READ_TOKEN`
- `COMMAND_PORTAL_ALLOWED_ORIGINS`

Do not create a `VITE_` token or credential. `config/brand.json` contains the only browser-visible configuration currently required.

## Acceptance boundary

Deployment does not complete Phase 5X-C by itself. Hosted connection acceptance still requires an externally reachable authenticated Runtime API, a scoped read service identity, successful allowlisted reads, mutation/origin rejection checks, secret-isolation verification, and recorded proof/receipt evidence.

Until that acceptance is performed, keep production, enterprise, and cloud-primary readiness false.
