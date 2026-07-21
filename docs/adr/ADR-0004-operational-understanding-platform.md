# ADR-0004: Transition from Layered Architecture to Operational Understanding Platform

- **Status:** Accepted
- **Decision date:** 2026-07-17

## Context

The former six-layer model established useful separation of concerns, but NEXUS now contains continuous context assembly, interaction, validation, authority, orchestration, learning, and multi-client Runtime contracts that cross a simple vertical stack. Layer terminology increasingly implied fixed ordering and isolated ownership where the platform requires continuous, composable participation.

## Options

1. Retain the six-layer architecture unchanged.
2. Add the new lifecycle terminology while keeping both models equally canonical.
3. Adopt the Operational Understanding Platform as canonical and preserve legacy implementation names through explicit compatibility notes.

## Decision

Adopt option 3. NEXUS is an Operational Understanding Platform composed of:

1. Runtime Foundation
2. Operational Understanding Loop
3. Operational Capabilities
4. Operational Objects

The six canonical capabilities are Operational Observation, Operational Understanding, Operational Validation, Operational Authority, Operational Orchestration, and Operational Engagement.

## Consequences

### Benefits

- Architecture reflects continuous cognition and learning instead of a one-way stack.
- Runtime substrate is separated from operational capability.
- Shared Operational Objects provide a durable integration model.
- Capability ownership and executive presentation boundaries become clearer.
- Future services can evolve without forcing every concern into one layer.

### Costs and risks

- Documentation and developer vocabulary require a coordinated migration.
- Historical names will remain visible in code and contracts for some time.
- Teams must avoid treating the legacy-to-capability map as a mechanical one-to-one implementation rewrite.

## Migration strategy

1. Update constitutions, architecture guides, diagrams, glossaries, and developer guidance.
2. Use canonical terms in new comments, plans, capability descriptions, and user-facing architecture labels.
3. Preserve existing APIs, endpoints, database schema, namespaces, deployment identifiers, and persisted contracts unless a separately reviewed change is low risk.
4. Mark historical documents and legacy implementation identifiers explicitly.
5. Introduce Operational Object contracts incrementally through versioned adapters and ADRs.

## Backward compatibility

This decision changes conceptual architecture, not Runtime behavior. Existing names remain valid technical identifiers. NEXUS Conclave remains a reserved component name. The Executive Operating Loop remains the executive-facing expression of the broader Operational Understanding Loop.

## Future review

Review after the first versioned Operational Object contract is deployed and again before any public API or persisted-schema terminology migration.
