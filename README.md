# NEXUS Command Portal

The standalone NEXUS Experience Layer for observing a hosted Runtime and using governed capabilities from the authoritative local NEXUS Runtime through the NEXUS Experience Gateway.

The [NEXUS Platform Constitution](docs/architecture/NEXUS_Platform_Constitution.md) is the canonical architectural reference for this repository.

## Architecture

```text
Executive User
    ↓
Command Portal
    ↓
NEXUS Experience Gateway
    ↓
NEXUS Runtime Gateway
    ↓
NEXUS Runtime
    ↓
Provider Router
    ↓
Provider Registry
    ↓
AI Providers
```

The browser never communicates directly with either Runtime. Hosted observations use fixed same-origin GET routes under `/api/runtime`. The NEXUS Experience Gateway attaches the server-held credential, validates Runtime envelopes, negotiates schema and Runtime versions, retries bounded transient failures, enforces response limits, and exposes explicit connection and cache state. Live voice uses one exact SDP exchange route; no wildcard proxy or provider credential reaches the browser.

Tenant Operational Context is also Runtime-owned. When `NEXUS_CONTEXT_ASSERTION_SECRET` is configured on both services, the Experience Gateway issues a 60-second, single-use assertion for the fixed provisioned tenant and sends it on text and Realtime voice requests. Browser metadata cannot select, replace, or strengthen a tenant profile. An authenticated operational session supplies the human subject and role; otherwise the gateway truthfully uses its configured observer service principal. Runtime verifies the assertion and assembles the same eight-domain context model for every client.

Hosted operational access uses the separate `/api/operations` allowlist. Its current classification is single-workspace hosted alpha: signed HttpOnly sessions, CSRF verification, scoped authorization, idempotency keys, fixed tenant/workspace identity, and a server-only Runtime credential are enforced. It does not claim production multi-tenant isolation.

Local document intake, evidence query, project intelligence, artifact compilation, voice routing, missions, work sessions, approvals, governed execution requests, connector readiness, proof, and receipts use a separate explicit allowlist under `/api/local`. The browser supplies operator intent and renders Runtime results; it does not assemble operational context, calculate project scope or price, make governance decisions, or fabricate capability. There is no wildcard proxy or arbitrary URL forwarding.

## Hosted runtime mode

The portal uses `https://nexus-runtime-dev.fly.dev` by default. All runtime configuration is server-only:

```text
COMMAND_PORTAL_RUNTIME_API_BASE_URL
COMMAND_PORTAL_RUNTIME_READ_TOKEN
NEXUS_CONTEXT_ASSERTION_SECRET
COMMAND_PORTAL_CONTEXT_PRINCIPAL_ID
COMMAND_PORTAL_REQUEST_TIMEOUT_MS
COMMAND_PORTAL_REASONING_TIMEOUT_MS
COMMAND_PORTAL_REALTIME_TIMEOUT_MS
COMMAND_PORTAL_CACHE_TTL_MS
COMMAND_PORTAL_MAX_RESPONSE_BYTES
```

Never create a `VITE_` runtime variable or credential.

## Local use

Requires Node.js 20.19 or newer.

```sh
npm install
cp .env.example .env
npm run check
npm run start
```

For local-first capability development, first run the private Runtime from the `nexus-assistant` repository:

```sh
nexus/bin/python -m nexus_api.server --host 127.0.0.1 --port 8765
```

Set `COMMAND_PORTAL_LOCAL_CAPABILITIES_ENABLED=true`, then run `npm run dev:server` and `npm run dev` separately. Vite proxies `/api/runtime` and `/api/local` to the Experience Gateway. The Gateway accepts a loopback local Runtime target only and does not send the hosted Runtime credential to it.

## Local-first capability parity

- Document Intelligence ingests supported files, links sources to projects, queries evidence, and displays the Runtime source inventory.
- Nexicron Projects creates project records and consumes Runtime-owned scope, estimate, planning context, evidence, and artifact contracts.
- Voice Operator supports natural full-duplex WebRTC audio, server voice detection, streaming response audio, interruption, independent microphone mute, and independent NEXUS playback mute through the Runtime-owned Realtime session contract. Mute controls remain browser media controls and do not end or redefine the governed Runtime session. Typed requests remain available through the shared Runtime Human Interaction Framework.
- Human Interaction Framework events provide the common Runtime-owned conversation, speech, streaming, interruption, avatar, navigation, focus, highlighting, and presentation behavior contract shared with NEXUS Command.
- A persistent NEXUS executive copilot remains available across Operations Center, Document Intelligence, Nexicron Projects, Mission Control, topology, providers, and evidence views. On desktop it receives a dedicated application column and resizes the workspace rather than covering it; it overlays only below the mobile breakpoint. It carries one conversation ID, supports Runtime-governed text and Realtime voice, and presents model-native limitations without assembling Operational Context in the browser.
- Runtime interaction and Conclave responses use the Experience Gateway's single `data` envelope. Form examples are placeholders rather than submitted defaults, so operator intent is always explicit.
- Mission Control consumes the versioned Runtime Client Parity Contract and presents mission planning, bounded work sessions, approval decisions, dry-run and governed execution requests, and connector readiness.

Only capabilities reported as implemented by Runtime are presented as executable. Numeric estimates remain unavailable when required rate or quantity evidence is absent. The browser owns microphone capture, audio playback, and visual state only. Runtime owns voice provider configuration, instructions, context boundaries, and execution constraints; the permanent provider key remains server-side.

## Truth boundary

The portal preserves `productionReady=false`, `enterpriseReady=false`, `cloudPrimary=false`, `localSourceOfTruth=true`, `defaultProvider=mock_model`, `conclave=available_bounded_review`, and `actualTrainedSLMs=0`. Conclave is a structured Runtime review that preserves dissent but does not claim independent model participants or authorize execution. Provider configuration never proves reachability or live inference.

See [HostedOperationalGateway.md](docs/HostedOperationalGateway.md), [ClientParityContract.md](docs/ClientParityContract.md), [LocalFirstParity.md](docs/LocalFirstParity.md), [ExperienceGateway.md](docs/architecture/ExperienceGateway.md), [RuntimeConnection.md](docs/RuntimeConnection.md), [FailureModes.md](docs/FailureModes.md), [Caching.md](docs/Caching.md), and [VersionNegotiation.md](docs/VersionNegotiation.md).
