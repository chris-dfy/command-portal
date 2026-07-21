# Command Portal Project Rules

Follow the [NEXUS Platform Constitution](docs/architecture/NEXUS_Platform_Constitution.md). It is the canonical architectural reference for this repository and supersedes informal terminology.

## Scope

- This repository is the standalone hosted command portal. Never place its implementation in `nexus-assistant` or register it as a `nexicron-demo-factory` tenant.
- Phase 5X-D connects the Command Portal to the hosted NEXUS Runtime exclusively through the server-side NEXUS Experience Gateway.
- Hosted Runtime access remains an observation surface. Local-first document, project, and voice capabilities may mutate only through explicitly allowlisted Experience Gateway routes backed by the authoritative local Runtime.
- No client may assemble operational context, calculate project intelligence, determine authority, or manufacture proof. Every NEXUS client consumes the same Runtime contracts.

## Canonical architecture

- NEXUS is an Operational Understanding Platform, not a layered architecture. Follow the four domains defined in the Constitution: Runtime Foundation, Operational Understanding Loop, Operational Capabilities, and Operational Objects.
- Use the canonical capabilities Operational Observation, Operational Understanding, Operational Validation, Operational Authority, Operational Orchestration, and Operational Engagement.
- The Command Portal is an Operational Engagement client. Runtime owns semantic behavior and operational truth; the portal owns presentation, accessibility, navigation, and browser media controls.
- Use historical layer terminology only for compatibility notes or unchanged technical identifiers. Do not rename existing APIs, routes, schemas, environment variables, or namespaces during terminology-only work.

## Identity

- Product identity is loaded from `config/brand.json` and may be overridden only through safe, browser-visible brand configuration.
- Names such as NEXUS Command, NEXUS, and Nexicron are temporary labels. They must not appear in API contracts, routes, data models, security decisions, shared component names, or persisted identifiers.

## Runtime boundary

- Preserve the architecture: Executive User -> Command Portal -> NEXUS Experience Gateway -> NEXUS Runtime Gateway -> NEXUS Runtime -> Provider Router -> Provider Registry -> AI Providers.
- Begin every future Codex implementation prompt with: "Follow the NEXUS Platform Constitution."
- Runtime credentials are server-only. Never prefix credentials with `VITE_`, serialize them into browser responses, include them in logs, or commit them.
- Hosted `/api/runtime` access permits only explicitly mapped GET routes. Local `/api/local` access permits only the exact documented method/path pairs and validated payloads. Reject arbitrary paths, unsafe query parameters, unsupported methods, and unregistered artifact types.
- Keep request timeouts, response size limits, safe error normalization, origin checks, and a short non-authoritative cache.

## Truth and hosted mode

- Always preserve: `productionReady=false`, `enterpriseReady=false`, `cloudPrimary=false`, `localSourceOfTruth=true`, and `secretValuesExposed=false` unless a later, proof-backed contract version explicitly changes them.
- Conclave provides an available bounded Runtime review. It preserves structured dissent and synthesis but does not claim independent model participants or authorize execution. `actualTrainedSLMs` is zero unless verified physical model assets prove otherwise.
- Hosted Runtime remains the read-only observation source. The private local Runtime is authoritative for local-first intake, project intelligence, and voice operations. Failure in either mode must not silently fall back to fabricated operational values.
- Model-native knowledge is useful for reasoning and candidate generation, but is never proof of current facts, organization facts, runtime capabilities, or completed work.

## Asset doctrine

- Assume an asset or capability does not exist until it is physically present, registered, configured, authorized, tested, deployed, verified, and linked to proof.
- Keep `config/platform-assets.v1.json` versioned and valid. It must cover knowledge, data, schemas, handlers, connectors, workflows, specialists, prompts, indexes, models, policies, evaluations, APIs, UI modules, proofs, receipts, and test fixtures.
- Generated assets remain candidates until reviewed, evaluated, approved, versioned, registered, deployed, and verified.

## Quality gates

- Before handoff, run formatting/type checks where configured, unit and contract tests, and the production build.
- Add tests for any NEXUS Experience Gateway route, security boundary, mode behavior, or truth-boundary change.
- Update `docs/nexus-runtime-contract` when the portal contract changes and `docs/reference-ui` when the UI system changes.
- Do not claim access to the missing curated `nexicron-demo-factory` Replit reference. Keep that limitation documented.
