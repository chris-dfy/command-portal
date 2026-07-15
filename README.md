# Standalone Command Portal

A standalone, hosted-ready, read-only command portal for observing an allowlisted Runtime API through a same-origin backend-for-frontend (BFF).

The temporary identity is configured in `config/brand.json`. It is deliberately absent from routes, contracts, security policy, data models, and shared component names so a future rename is a configuration change.

## Architecture

```text
Browser  -- same-origin GET -->  Portal BFF  -- allowlisted GET + server credential -->  Runtime API
```

The BFF is not a generic proxy. It rejects arbitrary portal routes, unsafe query parameters, and POST, PUT, PATCH, or DELETE. The runtime read credential is read only by the server and is never included in browser configuration, API envelopes, static assets, or logs.

## Portal areas

- Overview
- Verification
- Evidence
- Architecture
- Specialists
- System

## Data modes

Set `COMMAND_PORTAL_MODE` to one of:

- `contract_fixture` — starts without a runtime and displays conspicuously labeled, non-live Phase 5X-A contract data.
- `local_runtime` — reads the configured runtime using the fixed server-side allowlist. A 30-second cache is non-authoritative and expired data is labeled stale.
- `disconnected` — intentionally returns no operational values and explains that the runtime is disconnected.

## Local use

Requires Node.js 20 or newer.

```bash
npm install
npm run check
cp .env.example .env
npm run start
```

For client development, run `npm run dev:server` and `npm run dev` in separate terminals. The Vite client proxies only `/api/portal` to the local BFF.

## Replit import

The repository includes `.replit`, `replit.nix`, a production build command, and a single-port start command. Add server secrets in Replit Secrets, never in source or any `VITE_` variable. See `docs/REPLIT_DEPLOYMENT.md`.

## Truth boundary

The portal always preserves these current facts:

- `productionReady=false`
- `enterpriseReady=false`
- `cloudPrimary=false`
- `localSourceOfTruth=true`
- `secretValuesExposed=false`
- Conclave is staged
- `actualTrainedSLMs=0`

Phase 5X-B is the standalone implementation milestone. Phase 5X-C remains pending until a Replit application is created, deployed, configured, connected, and accepted.

## Documentation

- `docs/nexus-runtime-contract/` — curated runtime/BFF contract package
- `docs/reference-ui/` — design system, shell, components, responsive, and accessibility rules
- `config/platform-assets.v1.json` — versioned platform asset manifest
- `openapi/portal-readonly.openapi.json` — browser-facing read-only API description

The expected `nexicron-demo-factory` repository and its curated Replit design reference were not accessible. No access is claimed; the UI derives from the generated command portal client and current NEXUS Command frontend that were available locally.
