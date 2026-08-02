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

There is no direct conversational mutation allowlist under `/api/runtime`. Former Executive Briefing, Conclave review, HIF interaction, Voice Operator transcript, executive-intent, and generic action routes return `410 canonical_interaction_required`, identify `/executive/interactions` as the required coordinator, and never contact Runtime. Realtime SDP negotiation remains a transport-only exception; finalized transcripts still re-enter through canonical interaction admission before any final response.

No query parameters, record interpolation, wildcard proxy, or arbitrary forwarding exists.

## Local private Runtime

Local routes are disabled unless `COMMAND_PORTAL_LOCAL_CAPABILITIES_ENABLED=true`, and their upstream target must be loopback.

| Browser route | Method | Local Runtime endpoint |
| --- | --- | --- |
| `/api/local/status` | GET | `/health` |
| `/api/local/executive-interactions` | POST | `/executive/interactions` |
| `/api/local/intake/history` | GET | `/intake/history?limit=30` |
| `/api/local/intake/upload` | POST | `/intake/upload` |
| `/api/local/intake/query` | POST | `/intake/query` |
| `/api/local/projects` | POST | `/projects` |
| `/api/local/projects/artifact-types` | GET | `/projects/artifact-types` |
| `/api/local/projects/{id}/sources` | GET | `/projects/{id}/sources` |
| `/api/local/projects/{id}/evidence` | GET | `/projects/{id}/evidence` |
| `/api/local/projects/{id}/scope` | GET | `/projects/{id}/scope` |
| `/api/local/projects/{id}/estimate` | GET | `/projects/{id}/estimate` |
| `/api/local/projects/{id}/planning-model` | GET | `/projects/{id}/planning-model` |
| `/api/local/projects/{id}/artifacts` | GET | `/projects/{id}/artifacts` |
| `/api/local/projects/{id}/compile` | POST | `/projects/{id}/compile` |
| `/api/local/voice/status` | GET | `/voice/status` |
| `/api/local/voice-operator/status` | GET | `/voice-operator/status` |
| `/api/local/voice-operator/history` | GET | `/voice-operator/history?limit=8` |
| `/api/local/voice-operator/receipts` | GET | `/voice-operator/receipts?limit=8` |

Typed NEXUS Command input, finalized voice transcripts, Executive Briefing prompts, and Conclave review prompts use only `/api/local/executive-interactions` locally or `/api/operations/executive-interactions` when hosted. The former `/api/runtime/executive-briefing`, `/api/runtime/conclave/reviews`, `/api/runtime/interactions`, `/api/local/interactions`, `/api/local/voice-operator/route-transcript`, executive-intent, and generic action routes are explicit `410` tombstones. Dynamic project IDs must match the Gateway's safe identifier grammar. Queries, unknown methods, unknown routes, unsafe filenames, and unregistered artifact types are rejected before Runtime contact.
