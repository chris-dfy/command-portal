# NEXUS Runtime Client Capability Contract

The NEXUS Runtime Client Capability Contract is the versioned inventory of registered Runtime operations consumed by NEXUS Command and the NEXUS Web App. Runtime publishes it at `GET /client-capabilities`; the web app reads it only through an exact Experience Gateway route: `GET /api/local/client-capabilities` in local mode or authenticated `GET /api/operations/client-capabilities` in hosted mode.

It is not the client module inventory and does not assert full surface or behavioral parity. The shared `src/platform/surface-registry.json` owns the complete top-level desktop/web surface union and records each client surface as `functional`, `read_only`, `local_only`, or `unavailable`.

## Ownership boundary

NEXUS Runtime owns operational context, intent resolution, planning, governance, approvals, execution decisions, proof, and receipts. Clients own layout, input capture, accessibility, animation, confirmation presentation, and result rendering. A browser confirmation records operator intent but never constitutes Runtime approval.

No client may assemble an independent operational context, infer that a handler exists, or convert a configured connector into a verified capability. A capability may appear executable only when its contract entry reports a physically registered Runtime implementation and its explicit gateway route exists.

## Contract fields

Each capability declares a stable identifier, workspace, Runtime owner, portability, implementation state, client support, limitations, and operations. Each operation declares its Runtime method and path plus risk, approval, proof, and receipt requirements.

The contract's comparison section is derived only from its listed registered Runtime operations. It must set `surfaceParityClaimed=false`; it cannot be used to infer support for an unlisted native surface. CI regression tests cover both the complete shared surface inventory and representative exact Runtime behavior, including route admission, scope, CSRF, idempotency, proof, receipt, readiness, and fail-closed negative cases.

## Current registered operational scope

- Mission-planning intent through canonical interaction admission, plus governed mission-step submission
- Work-session planning intent through canonical interaction admission, plus governed start, state control, and receipts
- Approval queue decisions
- Canonical typed and finalized-voice interaction admission
- Read-only connector registry projection
- Connector readiness
- Proof and receipt visibility through registered reads
- Runtime-scoped client presentation effects
- Document intelligence
- NEXUS project planning, scope, pricing, and artifact compilation

The contract reports hosted execution separately from capability implementation. A hosted workspace is presented only when Runtime reports `hostedExecutionAvailable=true`, its capability entry is implemented for `nexusWeb`, and an exact authenticated gateway route exists. This does not claim production readiness, enterprise readiness, verified live model inference, or connector reachability.

Version 1.1 covers `registered_runtime_operations_v1`; it deliberately remains incomplete as a native client inventory. Missing operations stay absent from this contract and their surfaces remain explicitly constrained by the shared Experience surface registry rather than being silently represented as parity.

## Adding a capability

1. Implement and test the Runtime handler, governance behavior, evidence, and truth boundary.
2. Register the operation in the Runtime contract.
3. Add an exact Experience Gateway route and strict request validator; never add a wildcard proxy.
4. Add presentation adapters in each supported client without duplicating operational behavior.
5. Update cross-client inventory, route, state, and representative behavior tests. A portable native capability must not silently remain absent from either client.
