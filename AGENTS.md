# Command Portal Project Rules

## Scope

- This repository is the standalone hosted command portal. Never place its implementation in `nexus-assistant` or register it as a `nexicron-demo-factory` tenant.
- Phase 5X-B produces a Replit-importable application. Phase 5X-C remains pending until a hosted application is deployed, configured, connected, and accepted.
- The browser is an observation surface only. Do not add command dispatch, approvals, uploads, mutation controls, or generic proxy behavior.

## Identity

- Product identity is loaded from `config/brand.json` and may be overridden only through safe, browser-visible brand configuration.
- Names such as NEXUS Command, NEXUS, and Nexicron are temporary labels. They must not appear in API contracts, routes, data models, security decisions, shared component names, or persisted identifiers.

## Runtime boundary

- Preserve the architecture: browser -> same-origin portal BFF -> runtime API.
- Runtime credentials are server-only. Never prefix credentials with `VITE_`, serialize them into browser responses, include them in logs, or commit them.
- The BFF permits only explicitly mapped GET routes. Reject arbitrary paths, unsafe query parameters, and POST, PUT, PATCH, and DELETE.
- Keep request timeouts, response size limits, safe error normalization, origin checks, and a short non-authoritative cache.

## Truth and modes

- Always preserve: `productionReady=false`, `enterpriseReady=false`, `cloudPrimary=false`, `localSourceOfTruth=true`, and `secretValuesExposed=false` unless a later, proof-backed contract version explicitly changes them.
- Conclave is staged. `actualTrainedSLMs` is zero unless verified physical model assets prove otherwise.
- Supported modes are `contract_fixture`, `local_runtime`, and `disconnected`. Fixture data must be conspicuously labeled non-live. Disconnected mode must not fabricate operational values.
- Model-native knowledge is useful for reasoning and candidate generation, but is never proof of current facts, organization facts, runtime capabilities, or completed work.

## Asset doctrine

- Assume an asset or capability does not exist until it is physically present, registered, configured, authorized, tested, deployed, verified, and linked to proof.
- Keep `config/platform-assets.v1.json` versioned and valid. It must cover knowledge, data, schemas, handlers, connectors, workflows, specialists, prompts, indexes, models, policies, evaluations, APIs, UI modules, proofs, receipts, and test fixtures.
- Generated assets remain candidates until reviewed, evaluated, approved, versioned, registered, deployed, and verified.

## Quality gates

- Before handoff, run formatting/type checks where configured, unit and contract tests, and the production build.
- Add tests for any BFF route, security boundary, mode behavior, or truth-boundary change.
- Update `docs/nexus-runtime-contract` when the portal contract changes and `docs/reference-ui` when the UI system changes.
- Do not claim access to the missing curated `nexicron-demo-factory` Replit reference. Keep that limitation documented.
