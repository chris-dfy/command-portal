# Local-First Web Capability Parity

The NEXUS web app is an Operational Engagement client of the same private Runtime used by Desktop NEXUS Command. It does not maintain a second operational model.

## Capability ownership

The browser captures user inputs and renders results. The NEXUS Experience Gateway enforces the local route allowlist, request validation, loopback restriction, size limits, and safe failures. NEXUS Runtime owns document ingestion, evidence retrieval, Operational Context Framework assembly, project scope and estimate generation, artifact compilation, voice intent routing, governance, proof, receipts, and bounded execution.

No client may implement its own context assembly logic. Desktop, web, mobile, edge, and future clients must consume stable Runtime interfaces for the same context model.

Interaction behavior is Runtime-owned through the canonical `POST /executive/interactions` coordinator. The web app submits both typed input and finalized voice transcripts through `/api/local/executive-interactions`; the gateway forwards them to the single Runtime endpoint after injecting server-configured corroborating actor and workspace identity. The browser does not classify, authorize, or execute an utterance. It may apply a navigation-only effect only when Runtime explicitly returns `execution_scope: "client_presentation"`.

## Current web capabilities

- Document Intelligence uploads supported documents, optionally associates them with a project, queries registered evidence, and shows intake history.
- NEXUS Projects creates projects and reads Runtime-generated scope, evidence-linked estimates, planning context, and artifact availability.
- Realtime voice captures audio and receives finalized provider transcription, then waits for the canonical Runtime interaction result. It renders `response_text` once and asks the provider to narrate that exact text once; the provider does not independently answer the turn.

## Truth boundaries

- An uploaded document is a registered source, not proof that every statement in it is true.
- A generated artifact is executable only when its Runtime registration reports an implemented handler. Schema registration alone does not prove implementation.
- A numeric estimate is shown only when the Runtime has sufficient quantity and rate Evidence. Missing values remain explicit; the browser never invents NEXUS pricing.
- Provider configuration, browser support, or a successful request does not prove an action completed. Completion claims require Runtime proof, receipt, and postcondition evidence.
- Browser speech recognition and synthesis may be provided by the browser, operating system, or an external service. NEXUS Runtime does not currently verify their processing location.

## Deployment boundary

Local capability routing is disabled by default and permits only a loopback Runtime target. Source presence and local tests do not establish hosted or production execution readiness; that requires target-environment handler, Authority, verification, and durable receipt evidence.
