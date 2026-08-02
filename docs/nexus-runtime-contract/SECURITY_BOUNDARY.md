# Security Boundary

This boundary enforces the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

## Credential isolation

`COMMAND_PORTAL_RUNTIME_READ_TOKEN` is read only by the Node server. The NEXUS Experience Gateway adds it to allowlisted upstream reads. It is never returned, logged, embedded in source maps, or exposed through a `VITE_` variable. The credential should carry only the runtime scope `nexus.portal.read` when such an identity is issued.

## Browser boundary

- Same-origin reads are the intended access path.
- Requests with an `Origin` header must match the request origin or an exact configured origin.
- Wildcard CORS is not emitted.
- Observation routes under `/api/runtime` accept only GET and OPTIONS.
- Conversational input, Mission and Work Session planning intent, executive briefing requests, Conclave review prompts, typed NEXUS Command, and finalized voice transcripts all enter through the canonical interaction gateway, which alone forwards to `POST /executive/interactions`.
- Every other domain POST below `/api/local/*` or `/api/operations/*` returns `410 canonical_interaction_required` before authentication, payload parsing, capability lookup, or Runtime contact. Retained domain status and evidence routes are GET-only.
- Exact approval `approve` and `deny` routes record the decision associated with the original interaction; they are not an alternate action or execution ingress.
- Realtime SDP negotiation accepts POST only to establish provider transport; it cannot produce an admitted final response until the finalized transcript has completed canonical Runtime interaction admission.
- Operational-session, registered-session, and provider-identity POSTs are identity lifecycle only and cannot classify, authorize, or execute domain intent.
- In hosted operational mode, canonical interactions and Realtime SDP mutations require the signed operational session and CSRF proof.
- Unknown portal paths return 404 and never contact the runtime.
- All query parameters return 400.

## Runtime boundary

- Each browser route has a literal runtime route mapping.
- Redirects are rejected.
- Default timeout: 8 seconds.
- Default maximum response: 1 MiB.
- The exact canonical Capability Registry read alone has a fixed 4 MiB
  ceiling; its validated projection is never cached and no other route
  inherits this exception.
- Retained domain GET routes resolve to one fixed canonical read identity and
  require a current, scope-matching Runtime-owned Capability Registry
  projection before any target Runtime is contacted. Missing, stale,
  unavailable, ambiguous, or contract-mismatched read truth fails closed.
- Canonical interaction admission resolves only the exact registered
  `POST /executive/interactions` action. Runtime performs classification,
  policy, Authority, authorization, bounded execution, receipt creation, and
  postcondition verification after that admission.
- The historical `/api/replay` export proxy remains a registered unavailable
  adapter and never contacts its legacy upstream.
- Default cache TTL: 15 seconds.
- Cache entries are non-authoritative. An expired entry is used only after a failed refresh and is labeled `stale`.

## Local capability boundary

`/api/local` is a separate, disabled-by-default boundary for a loopback-only private Runtime. It uses exact method/path mappings, payload allowlists, request and response size limits, timeouts, and safe error normalization. It never receives the hosted Runtime credential.

The browser may submit a user action request only as a canonical interaction. Runtime owns ingestion, context assembly, classification, intent construction, governance, proof, receipts, and execution decisions. The gateway injects canonical interaction actor and workspace fields from server identity; client-supplied identity or Authority fields fail closed. Approval continuation preserves the original interaction and returns through the same endpoint. Browser-selected attachment bytes remain local until a governed canonical attachment transport exists.

Hosted `/api/operations` exposes authenticated, scope-checked Runtime reads through an exact allowlist plus canonical interaction admission and exact approval decisions. Canonical interaction routes derive identity and workspace scope on the server, require CSRF and idempotency, and never infer Authority from the session. Local `/api/local` exposes only the governed capabilities documented in its endpoint allowlist. Neither boundary is a generic proxy or a second execution path.
