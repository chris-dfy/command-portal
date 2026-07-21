# NEXUS Command Portal Contributor Guidance

## Authority

Before making a material design or implementation decision, resolve and
validate `../constitution/registry/CURRENT.json`, load the applicable active
principle revisions, and then read
`../NEXUS_CONSTITUTIONAL_ARCHITECTURE.md` as the Registry's official human
projection. The verified immutable Registry release is the constitutional
source. If its pointer, digest, content, release manifest, or publication
projection disagree, stop and report the integrity failure.

Pin the release ID, digest, applicable principle entry IDs, and resolver
version in every material change. Emit a Principle Impact Record before the
work is complete. An unresolved conflict blocks the change; candidates cannot
amend the Registry.

Earlier architecture publications are historical records only; do not use,
revise, or extend them as design inputs. This file supplies portal-local
working instructions only. The active Registry and its bound publication
projection control on conflict.

## Experience boundary

- This repository is a hosted NEXUS Experience client. Runtime owns semantic
  and operational truth; the portal owns presentation, accessibility,
  navigation, and browser media controls.
- Clients consume governed Runtime contracts. They do not assemble canonical
  Context, calculate Authority, manufacture proof, infer absent Replay stages,
  or execute private operational logic.
- Preserve Operational Replay as a generic projection of the versioned Replay
  event stream. New capabilities appear through contract-conformant events,
  without capability-specific UI paths.
- Runtime credentials are server-only. Never expose them through browser
  configuration, responses, logs, or committed source.
- Keep route allowlists, payload validation, timeouts, response-size limits,
  origin checks, safe error normalization, and non-authoritative caching.
- Preserve truthful readiness values unless proof-backed verification changes
  them: `productionReady=false`, `enterpriseReady=false`,
  `cloudPrimary=false`, `localSourceOfTruth=true`, and
  `secretValuesExposed=false`.
- Hosted failure must be explicit. Never fall back to fabricated operational
  values, Evidence, confidence, Authority, or completion claims.
- Classify pretrained provider knowledge as `model_native`; it is not current,
  tenant, operational, or capability proof.

## Quality gates

Run configured formatting, type, unit, contract, security-boundary, and
production-build checks before handoff. Contract changes require matching
contract tests; presentation changes require accessible, responsive UI tests.
