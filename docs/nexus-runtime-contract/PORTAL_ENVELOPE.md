# Portal Envelope 1.0

Every API response uses the following shape:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "schemaVersion": "1.0",
    "generatedAt": "RFC-3339 timestamp",
    "sourceOfTruth": "nexus_runtime",
    "readOnly": true,
    "dataMode": "local_runtime",
    "verificationEnvironment": "local_runtime",
    "connectionState": "connected",
    "cached": false,
    "stale": false,
    "limitations": [],
    "proofIds": [],
    "receiptIds": [],
    "productionReady": false,
    "enterpriseReady": false,
    "cloudPrimary": false,
    "localSourceOfTruth": true,
    "secretValuesExposed": false
  }
}
```

Errors retain the same `meta`, set `ok=false` and `data=null`, and add a safe `{code,message}` object. Runtime response bodies, credentials, authorization headers, internal stacks, and arbitrary upstream errors are never exposed.

Fixture mode uses `sourceOfTruth=contract_fixture`, `dataMode=contract_fixture`, and `verificationEnvironment=non_live_contract_fixture`. It includes the limitation `CONTRACT FIXTURE — NON-LIVE DATA`.
