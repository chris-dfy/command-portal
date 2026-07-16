# NEXUS Client Parity Contract

The NEXUS Client Parity Contract is the versioned Runtime description of portable capabilities shared by NEXUS Command and the NEXUS Web App. The current local Runtime publishes it at `GET /client-capabilities`; the web app reads it only through the exact Experience Gateway route `GET /api/local/client-capabilities`.

## Ownership boundary

NEXUS Runtime owns operational context, intent resolution, planning, governance, approvals, execution decisions, proof, and receipts. Clients own layout, input capture, accessibility, animation, confirmation presentation, and result rendering. A browser confirmation records operator intent but never constitutes Runtime approval.

No client may assemble an independent operational context, infer that a handler exists, or convert a configured connector into a verified capability. A capability may appear executable only when its contract entry reports a physically registered Runtime implementation and its explicit gateway route exists.

## Contract fields

Each capability declares a stable identifier, workspace, Runtime owner, portability, implementation state, client support, limitations, and operations. Each operation declares its Runtime method and path plus risk, approval, proof, and receipt requirements.

The parity section is derived from the capability entries. `driftCount` identifies portable capabilities implemented in NEXUS Command but not in NEXUS Web within the declared inventory scope. CI regression tests cover the web client adapters, exact gateway routes, strict payload validation, Runtime ownership language, and the absence of client-side context assembly.

## Current portable surface

- Mission planning and governed mission-step submission
- Governed work-session planning, start, state control, and receipts
- Approval queue decisions
- Action dry runs and governed execution requests
- Connector readiness
- Proof and receipt visibility
- Human Interaction Framework behavior
- Document intelligence
- Nexicron project planning, scope, pricing, and artifact compilation

The contract currently describes local Runtime availability. It does not claim hosted execution, production readiness, enterprise readiness, verified live model inference, or connector reachability.

Version 1.0 covers `operational_core_v1`; it is not yet a complete inventory of every native administration and hardware surface. The Runtime reports the remaining surfaces explicitly, including adaptive learning, builder/self-improvement, browser control, continuity and budget administration, model/persistence administration, hosted-team administration, and hardware wake control. These must move into later contract versions rather than being silently represented as parity.

## Adding a capability

1. Implement and test the Runtime handler, governance behavior, evidence, and truth boundary.
2. Register the operation in the Runtime contract.
3. Add an exact Experience Gateway route and strict request validator; never add a wildcard proxy.
4. Add presentation adapters in each supported client without duplicating operational behavior.
5. Update parity tests. A portable native capability must not silently remain absent from the web client.
