# Experience Gateway Endpoint Allowlist

This allowlist enforces the communication boundary defined by the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

| Browser GET route | Runtime GET endpoint |
| --- | --- |
| `/api/runtime/status` | `/runtime/status` |
| `/api/runtime/health` | `/health` |
| `/api/runtime/ready` | `/ready` |
| `/api/runtime/version` | `/runtime/version` |
| `/api/runtime/providers` | `/runtime/providers` |
| `/api/runtime/capabilities` | `/runtime/capabilities` |
| `/api/runtime/proofs` | `/runtime/proofs` |
| `/api/runtime/receipts` | `/runtime/receipts` |
| `/api/runtime/environment` | `/runtime/environment` |
| `/api/runtime/diagnostics` | `/runtime/diagnostics` |
| `/api/runtime/governance` | `/runtime/governance` |
| `/api/runtime/connectors` | `/runtime/connectors` |
| `/api/runtime/conclave` | `/runtime/conclave/status` |

There is no direct conversational mutation allowlist under `/api/runtime`. Former Executive Briefing, Conclave review, HIF interaction, Voice Operator transcript, executive-intent, generic action, `/missions/plan`, `/work-sessions/plan`, and Mission 4 create/action routes return `410 canonical_interaction_required`, identify `/executive/interactions` as the required coordinator, and never contact Runtime. Realtime SDP negotiation remains a transport-only exception; finalized transcripts still re-enter through canonical interaction admission before any final response. `/api/canonical-execution` and `/api/canonical-execution/missions/{id}` retain authenticated GET-only historical evidence; the browser exposes no corresponding mutation client.

No query parameters, record interpolation, wildcard proxy, or arbitrary forwarding exists.

## Local private Runtime

Local routes are disabled unless `COMMAND_PORTAL_LOCAL_CAPABILITIES_ENABLED=true`, and their upstream target must be loopback.

| Browser route | Method | Local Runtime endpoint |
| --- | --- | --- |
| `/api/local/status` | GET | `/health` |
| `/api/local/executive-interactions` | POST | `/executive/interactions` |
| `/api/local/approvals/{interaction_id}/approve` | POST | `/approvals/{interaction_id}/approve` |
| `/api/local/approvals/{interaction_id}/deny` | POST | `/approvals/{interaction_id}/deny` |
| `/api/local/intake/history` | GET | `/intake/history?limit=30` |
| `/api/local/projects/artifact-types` | GET | `/projects/artifact-types` |
| `/api/local/projects/{id}/sources` | GET | `/projects/{id}/sources` |
| `/api/local/projects/{id}/evidence` | GET | `/projects/{id}/evidence` |
| `/api/local/projects/{id}/scope` | GET | `/projects/{id}/scope` |
| `/api/local/projects/{id}/estimate` | GET | `/projects/{id}/estimate` |
| `/api/local/projects/{id}/planning-model` | GET | `/projects/{id}/planning-model` |
| `/api/local/projects/{id}/artifacts` | GET | `/projects/{id}/artifacts` |
| `/api/local/voice/status` | GET | `/voice/status` |
| `/api/local/voice-operator/status` | GET | `/voice-operator/status` |
| `/api/local/voice-operator/history` | GET | `/voice-operator/history?limit=8` |
| `/api/local/voice-operator/receipts` | GET | `/voice-operator/receipts?limit=8` |

Typed NEXUS Command input, finalized voice transcripts, and every browser-originated domain action use only `/api/local/executive-interactions` locally or `/api/operations/executive-interactions` when hosted. The Runtime coordinator alone classifies the interaction and decides whether it is conversational, requires an exact approval, or may proceed as bounded execution. Approval `approve` and `deny` routes are exact decision-record exceptions; an approval does not create an alternate execution ingress.

Every other POST below `/api/local/*` or `/api/operations/*`, including Document, Project, Mission, Work Session, Conclave, Knowledge, and Runtime Admission mutations, is an explicit `410 canonical_interaction_required` tombstone. The tombstone runs before authentication, request parsing, capability lookup, or upstream resolution and therefore never contacts Runtime. Realtime SDP negotiation at `/api/runtime/realtime/call` remains transport-only, and operational-session, registered-session, and provider-identity endpoints remain identity lifecycle only. None may classify or execute user intent.

Browser-selected attachment bytes currently remain browser-local because the canonical interaction envelope has no governed attachment transport. The browser may submit a bounded description of the requested intake; it must not claim that file ingestion completed unless Runtime returns proof, a receipt, and verified postconditions through the canonical interaction result. Dynamic read identifiers must match the Gateway's safe identifier grammar. Queries, unknown methods, unknown routes, and unsafe identifiers are rejected before Runtime contact.
