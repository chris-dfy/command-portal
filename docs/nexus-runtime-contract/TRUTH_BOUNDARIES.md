# Truth Boundaries

Until a later proof-backed contract changes them, every portal response and every UI area must preserve:

- `productionReady=false`
- `enterpriseReady=false`
- `cloudPrimary=false`
- `localSourceOfTruth=true`
- `secretValuesExposed=false`
- Conclave is `staged`
- `actualTrainedSLMs=0`
- Hosted connection acceptance is pending Phase 5X-C

No UI language may convert `preview`, `staged`, `configured`, `candidate`, `fixture`, or `local` into `live`, `deployed`, `trained`, `hosted`, `production`, or `accepted`.

`contract_fixture` values demonstrate schema and navigation behavior only. `disconnected` mode reports absence and does not backfill values. `local_runtime` reports runtime responses, proof links, receipt links, limitations, cache state, and staleness without strengthening claims.
