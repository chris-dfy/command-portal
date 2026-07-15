# Endpoint Allowlist

Every mapping is read-only. No client-supplied runtime path is accepted.

| Portal route | Runtime route |
|---|---|
| `/api/portal/status` | `/api/nexus/status` |
| `/api/portal/readiness` | `/api/nexus/readiness` |
| `/api/portal/claims` | `/api/nexus/claims` |
| `/api/portal/proofs` | `/api/nexus/proofs` |
| `/api/portal/receipts` | `/api/nexus/receipts` |
| `/api/portal/layers` | `/api/nexus/layers` |
| `/api/portal/connectors` | `/api/nexus/connectors` |
| `/api/portal/operator-alpha` | `/api/nexus/operator-alpha` |
| `/api/portal/projects` | `/api/nexus/projects` |
| `/api/portal/sources` | `/api/nexus/intake/sources` |
| `/api/portal/intake-status` | `/api/nexus/intake/status` |
| `/api/portal/cdp` | `/api/nexus/cdp/status` |
| `/api/portal/artifacts` | `/api/nexus/artifacts` |
| `/api/portal/asset-manifest` | `/api/nexus/assets/manifest` |
| `/api/portal/asset-coverage` | `/api/nexus/assets/coverage` |
| `/api/portal/capabilities` | `/api/nexus/capabilities` |
| `/api/portal/live-policy` | `/api/nexus/capabilities/live-policy` |
| `/api/portal/exposure` | `/api/nexus/replit-exposure` |
| `/api/portal/specialists` | `/api/nexus/slm/specialists` |
| `/api/portal/model-hosting` | `/api/nexus/slm/hosting` |
| `/api/portal/runtime-verification` | `/api/nexus/runtime-verification/status` |
| `/api/portal/runtime-matrix` | `/api/nexus/runtime-verification/matrix` |
| `/api/portal/phase5x-prerequisite` | `/api/nexus/runtime-verification/phase-5x-prerequisite` |
| `/api/portal/limitations` | `/api/nexus/limitations` |
| `/api/portal/persistence` | `/persistence/health` |
| `/api/portal/hosted-readiness` | `/team/hosted-readiness` |
| `/api/portal/supabase-readiness` | `/team/supabase/status` |
| `/api/portal/claim/{id}` | `/api/nexus/claims/{id}` |
| `/api/portal/proof/{id}` | `/api/nexus/proofs/{id}` |
| `/api/portal/receipt/{id}` | `/api/nexus/receipts/{id}` |
| `/api/portal/project/{id}` | `/api/nexus/projects/{id}` |
| `/api/portal/specialist/{id}` | `/api/nexus/slm/specialists/{id}` |
| `/api/portal/verification-record/{id}` | `/api/nexus/runtime-verification/records/{id}` |

`/api/portal/snapshot` is a BFF-owned aggregation of a fixed subset of these mappings. It does not accept domain names or runtime paths from the browser.
