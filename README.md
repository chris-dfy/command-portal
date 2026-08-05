# NEXUS Command Portal

The standalone NEXUS Operational Engagement client for observing a hosted Runtime and using governed capabilities from the authoritative NEXUS Runtime through the NEXUS Experience Gateway.

The [NEXUS Platform Constitution](docs/architecture/NEXUS_Platform_Constitution.md) is the canonical architectural reference for this repository.

## Architecture

NEXUS is an [Operational Understanding Platform](docs/architecture/Operational_Understanding_Platform.md) composed of a Runtime Foundation, the continuous Operational Understanding Loop, six Operational Capabilities, and shared Operational Objects. The portal presents the Executive Operational Experience; it does not own operational understanding, authority, or context assembly.

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

The browser never communicates directly with either Runtime. Hosted observations use fixed same-origin GET routes under `/api/runtime`. The NEXUS Experience Gateway attaches the server-held credential, validates Runtime envelopes, negotiates schema and Runtime versions, retries bounded transient failures, enforces response limits, and exposes explicit connection and cache state. This Command Portal artifact explicitly quarantines full-duplex Realtime voice: its SDP route fails closed with `realtime_voice_quarantined`, and no provider credential reaches the browser.

Tenant Operational Context is also Runtime-owned. When the Command Portal-only `NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET` is configured on this gateway and Runtime, the Experience Gateway issues a 60-second, single-use assertion under fixed key ID `context-assertion-command-portal-v1` for canonical interactions. The Portal never falls back to a shared client assertion key. Browser metadata cannot select, replace, or strengthen a tenant profile. All browser-originated domain actions use the single canonical interaction ingress and require the signed operational session and its CSRF proof. Typed and bounded browser-speech continuity enter that ingress; they do not prove full-duplex readiness.

Hosted operational access uses the separate `/api/operations` allowlist. Its current classification is single-workspace hosted alpha: signed HttpOnly sessions, CSRF verification, scoped authorization, idempotency keys, fixed tenant/workspace identity, and a server-only Runtime credential are enforced. The allowlist includes the Runtime Client Capability Contract plus the bounded Document Intelligence, Projects, and Voice Operator routes registered by that contract. It does not claim production multi-tenant isolation.

Local document intake, evidence query, project intelligence, artifact compilation, voice routing, missions, work sessions, approvals, governed execution requests, connector readiness, proof, and receipts use a separate explicit allowlist under `/api/local`. The browser supplies operator intent and renders Runtime results; it does not assemble operational context, calculate project scope or price, make governance decisions, or fabricate capability. There is no wildcard proxy or arbitrary URL forwarding.

## Hosted runtime mode

The portal uses `https://nexus-runtime-dev.fly.dev` by default. All runtime configuration is server-only:

```text
COMMAND_PORTAL_RUNTIME_API_BASE_URL
COMMAND_PORTAL_RUNTIME_READ_TOKEN
NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET
COMMAND_PORTAL_CONTEXT_PRINCIPAL_ID
COMMAND_PORTAL_REQUEST_TIMEOUT_MS
COMMAND_PORTAL_REASONING_TIMEOUT_MS
COMMAND_PORTAL_REALTIME_TIMEOUT_MS
COMMAND_PORTAL_CACHE_TTL_MS
COMMAND_PORTAL_MAX_RESPONSE_BYTES
```

`COMMAND_PORTAL_MAX_RESPONSE_BYTES` remains the general Runtime-read limit.
The fixed `/api/runtime/capability-registry` mapping has a separate,
non-configurable 4 MiB ceiling so the measured canonical projection fits
without widening any other route.

All remaining Runtime, local, and hosted-operation aliases require that
current Runtime-owned projection to admit one exact typed action before the
Gateway contacts a target upstream. Unavailable, stale, mismatched, or
unregistered actions fail closed. The legacy `/api/replay` export proxy is
retained only as an unavailable compatibility adapter and does not forward.

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

## Runtime-bound workspaces and surface truth

- Document Intelligence ingests supported files, links sources to projects, queries evidence, and displays the Runtime source inventory.
- NEXUS Projects creates project records and consumes Runtime-owned scope, estimate, planning context, Evidence, and artifact contracts.
- The retained Realtime compatibility code is quarantined and cannot activate. Typed input and bounded browser speech recognition remain continuity-only, submit each accepted transcript through `POST /executive/interactions`, and may narrate only the returned Runtime `response_text` through local browser speech.
- Typed NEXUS Command requests use that same canonical interaction endpoint. The browser supplies only input and presentation context; the Experience Gateway injects corroborating actor, tenant, role, and workspace values from its authenticated server session. Runtime alone classifies questions and actions, evaluates Authority, resolves capabilities, executes, verifies, and returns receipts.
- Direct Executive Briefing, Conclave review, HIF interaction, Voice Operator transcript, executive-intent, generic action, Mission/Work Session planning, and former Mission 4 create/action browser routes are retired with `410 canonical_interaction_required`; they cannot contact Runtime or produce a competing response. Planning buttons now submit through the same canonical interaction coordinator. Mission 4 status and retained Mission evidence remain read-only.
- A persistent NEXUS Command assistant remains available across Operations Center, Document Intelligence, NEXUS Projects, Mission Control, topology, providers, and Evidence views. On desktop it receives a dedicated application column and resizes the workspace rather than covering it; it overlays only below the mobile breakpoint. It carries one conversation ID and presents model-native limitations without assembling Operational Context in the browser.
- Canonical interaction and Conclave responses use the Experience Gateway's single `data` envelope. Form examples are placeholders rather than submitted defaults, so operator intent is always explicit.
- Mission and Work Session controls consume exact versioned Runtime operations. A control is enabled only when the matching registered route, scoped session, capability state, and action admission all pass.

The shared Experience surface registry is the single top-level module inventory for NEXUS Command and hosted NEXUS. It records the full 26-surface union and an explicit `functional`, `read_only`, `local_only`, or `unavailable` state and reason for each client. Navigation parity does not imply capability parity: only capabilities reported as implemented by Runtime and bound to an exact client route are presented as executable. Numeric estimates remain unavailable when required rate or quantity evidence is absent. The browser owns microphone capture, audio playback, and visual state only. Runtime owns voice provider configuration, instructions, context boundaries, and execution constraints; the permanent provider key remains server-side.

## Truth boundary

The portal preserves `productionReady=false`, `enterpriseReady=false`, `cloudPrimary=false`, `localSourceOfTruth=true`, `defaultProvider=mock_model`, `conclave=available_bounded_review`, and `actualTrainedSLMs=0`. Conclave is a structured Runtime review that preserves dissent but does not claim independent model participants or authorize execution. Provider configuration never proves reachability or live inference.

See [HostedOperationalGateway.md](docs/HostedOperationalGateway.md), [ClientParityContract.md](docs/ClientParityContract.md), [LocalFirstParity.md](docs/LocalFirstParity.md), [ExperienceGateway.md](docs/architecture/ExperienceGateway.md), [RuntimeConnection.md](docs/RuntimeConnection.md), [FailureModes.md](docs/FailureModes.md), [Caching.md](docs/Caching.md), and [VersionNegotiation.md](docs/VersionNegotiation.md).

The architecture transition and compatibility policy are documented in [ADR-0004](docs/adr/ADR-0004-operational-understanding-platform.md).
