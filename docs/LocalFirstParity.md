# Local-First Web Capability Parity

The NEXUS web app is an Operational Engagement client of the same private Runtime used by Desktop NEXUS Command. It does not maintain a second operational model.

## Capability ownership

The browser captures user inputs and renders results. The NEXUS Experience Gateway enforces the local route allowlist, request validation, loopback restriction, size limits, and safe failures. NEXUS Runtime owns document ingestion, evidence retrieval, Operational Context Framework assembly, project scope and estimate generation, artifact compilation, interaction classification, governance, proof, receipts, and bounded execution.

No client may implement its own context assembly logic. Desktop, web, mobile, edge, and future clients must consume stable Runtime interfaces for the same context model.

Interaction behavior is Runtime-owned through one coordinator. The web app submits typed input and finalized voice transcripts through `/api/local/executive-interactions`, which forwards only to `POST /executive/interactions`. It does not resolve intent or create interaction state locally. Client navigation occurs only when Runtime explicitly returns a registered `client_presentation` effect.

## Current web capabilities

- Document Intelligence uploads supported documents, optionally associates them with a project, queries registered evidence, and shows intake history.
- NEXUS Projects creates projects and reads Runtime-generated scope, evidence-linked estimates, planning context, and artifact availability.
- Voice accepts typed transcripts or capability-detected browser speech, admits them through the same canonical interaction coordinator, narrates only the Runtime response when browser synthesis is available, and displays Authority, verification, proof, receipt, and governed history.

## Truth boundaries

- An uploaded document is a registered source, not proof that every statement in it is true.
- A generated artifact is executable only when its Runtime registration reports an implemented handler. Schema registration alone does not prove implementation.
- A numeric estimate is shown only when the Runtime has sufficient quantity and rate evidence. Missing values remain explicit; the browser never invents Nexicron pricing.
- Provider configuration, browser support, or a successful request does not prove an action completed. Completion claims require Runtime proof, receipt, and postcondition evidence.
- Browser speech recognition and synthesis may be provided by the browser, operating system, or an external service. NEXUS Runtime does not currently verify their processing location.

## Deployment boundary

Local capability routing is disabled by default and permits only a loopback Runtime target. Hosted Runtime reads and mutations are admitted independently: a hosted operation requires a literal allowlisted route, server-derived tenant/workspace identity, the exact scope, same-origin and CSRF protection for mutation, bounded payload validation, idempotency where state may change, Runtime action admission where applicable, and postcondition evidence. Source presence and local tests do not establish hosted or production execution readiness; that requires target-environment handler, Authority, verification, and durable receipt evidence. Everything else fails closed; no wildcard or generic forwarding establishes capability.
