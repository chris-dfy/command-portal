# Threat Model

## Project Overview

This project is a standalone command portal: a React frontend served by a Node.js backend-for-frontend (BFF) that performs allowlisted requests to configured NEXUS Runtime APIs. The production entry point is `server/index.mjs`, with the main trust boundary enforcement in `server/portal-server.mjs`. The current deployment is non-production and private. The Registered Executive session adds fixed login, read, and revoke routes; it does not make general Runtime mutation reachable.

## Assets

- **Runtime read credential** -- `COMMAND_PORTAL_RUNTIME_READ_TOKEN` lets the BFF read from the upstream runtime API. Exposure would let an attacker query the upstream system directly within that token's scope.
- **Runtime-derived operational data** -- status, readiness, claims, proofs, receipts, and related portal data may be sensitive even in read-only form because it reflects internal system state.
- **Managed human identity ingress** -- the authoritative Replit path is the
  Agent-provisioned authorization-code flow with PKCE, state, nonce, bounded
  `max_age`, and signed `auth_time`. It is accepted only on the exact
  provider-owned development host or the configured published host in its
  matching deployment mode, with forwarded HTTPS, canonical issuer, and the
  provider-owned `REPL_ID` audience. Bare or forged identity headers never
  participate in this path. The callback immediately reduces the raw provider
  subject to an opaque binding and retains neither provider tokens nor the raw
  subject.
- **Provider transaction and session cookies** -- the short-lived OIDC
  transaction and provider session are authenticated-encrypted independently
  with AES-256-GCM and HKDF-separated keys. Their exact contracts,
  configuration digest, key ID, expiry, and purpose must match; neither cookie
  can substitute for the other, and the opaque provider binding is not exposed
  to the browser.
- **Portal integrity and truth posture** -- the portal is expected to preserve its declared truth boundary (`productionReady=false`, `secretValuesExposed=false`, non-live fixture labeling). Incorrect or forged values could mislead operators.
- **Service availability** -- the BFF fans out to multiple upstream routes for `/api/portal/snapshot`; resource exhaustion or hanging upstream calls can degrade portal availability.
- **Static browser bundle and visible configuration** -- frontend assets in `dist/` and browser-visible config from `config/brand.json` must not contain secrets or dangerous active content.
- **Human identity binding** -- the raw Replit provider subject is identity
  evidence. It must be verified server-side, converted to a one-way binding,
  and mapped only through the server-owned registration. Neither form is a
  browser privilege selector.
- **Registered Executive session** -- the short-lived HttpOnly cookie, CSRF
  value, session version, revocation checkpoint, and Runtime record control the
  human-session lifecycle. The session itself grants no Authority.
- **Human-session assertion trust** -- the purpose-bound signing secret, public
  key ID, issuer, audience, service/client bindings, and single-use identifiers
  protect the Gateway-to-Runtime human assertion. This is separate from the
  Mission 1 service context assertion.

## Trust Boundaries

- **Browser to BFF** -- all browser input crosses into `server/portal-server.mjs`. The browser is untrusted, so route, method, origin, and query validation must be enforced server-side.
- **Replit Auth to BFF** -- the interactive Agent-provisioned OIDC
  authorization-code callback is authoritative when enabled. It binds the
  callback to the sealed transaction's exact origin, state, nonce, PKCE verifier,
  issuer, `REPL_ID` audience, and recent provider authentication time. The
  strict configured JWT/JWKS verifier is a compatibility fallback only when
  interactive auth is disabled. Browser-supplied user headers, provider
  subjects, and privilege claims are untrusted.
- **Bootstrap to final configuration** -- interactive provider authentication
  may be enabled while Registered Executive sessions remain disabled. That
  bootstrap may establish only the encrypted provider session. After the
  server-owned registration exists in both provider secret managers and the
  exact Runtime is deployed, the same attested Experience source may enable the
  final gate; only then may the provider session reach Runtime verification.
- **Registration boundary** -- a verified opaque provider subject maps to one
  active server-owned non-production registration. The registration fixes
  human principal, tenant, workspace, role, scopes, policy, version,
  revocation checkpoint, and lifetime.
- **BFF to runtime API** -- the BFF sends allowlisted requests to `COMMAND_PORTAL_RUNTIME_API_BASE_URL` with a server-held bearer token. This boundary is the primary confidentiality risk in the application.
- **BFF human assertion to Runtime** -- the Runtime authenticates the Gateway
  service before verifying the separate at-most-60-second, single-use
  Registered Executive assertion for verify, read, and revoke. The Runtime
  registry and policy must match every claim exactly.
- **Static file serving boundary** -- the server must keep requests confined to `dist/` and prevent traversal into source files, config, fixtures outside intended access, or environment material.
- **Deployment visibility boundary** -- the current deployment is `private`, so unauthenticated public-internet reachability is not assumed. Findings that require public exposure are out of scope unless another reachable path is demonstrated.
- **Production vs dev-only boundary** -- `server/`, `src/`, `config/`, and built `dist/` are production-relevant. `tests/`, `docs/`, and `openapi/` are normally dev-only. `fixtures/` is mixed because it is also served intentionally in `contract_fixture` mode.

## Scan Anchors

- Production entry points: `server/index.mjs`, `server/portal-server.mjs`
- Highest-risk code: upstream runtime fetch path, origin validation, allowlisted route handling, static file serving
- Public/authenticated/admin surfaces: private presentation routes plus the
  fixed `/api/executive-session/login`, `/api/executive-session`, and
  `/api/executive-session/revoke` human-session lifecycle; there is no general
  admin plane
- Dev-only areas usually ignored: `tests/`, `docs/`, `openapi/`
- Mixed area: `fixtures/contract-fixture.json` is production-relevant only when explicitly running in `contract_fixture` mode

## Threat Categories

### Spoofing

An attacker may forge a Replit token or bare user header, substitute issuer or
audience, alter or replay the OIDC transaction, change callback state, reuse a
cookie for the wrong purpose, select a registered principal, or replay a human
assertion. The BFF must verify provider identity server-side and derive all
scope from the exact registration. The Runtime must verify service
authentication, signature, algorithm, key ID, issuer, audience, service/client
binding, session version, revocation checkpoint, expiry, policy, and single-use
identifier. Unknown or inactive registrations fail closed.

### Tampering

The browser must not be able to change which upstream route is queried or turn
the BFF into a generic proxy. Login and revoke accept only an empty JSON object;
read accepts no query. Client identity, tenant, workspace, role, scopes, policy,
session version, revocation checkpoint, Authority, Decision, Mission, and action
claims are never forwarded. Runtime rejection must not create or alter a
session, and failed revoke must still clear the local cookie.

### Information Disclosure

Runtime tokens, provider tokens, raw provider subjects, subject bindings,
provider-session secrets, cookie-signing secrets, assertion secrets, and
assertion tokens must never
appear in client bundles, API responses, logs, source maps, receipts, or
browser-visible configuration. The UI retains only the HttpOnly cookie
implicitly and the CSRF value in memory. Upstream errors remain normalized;
static serving remains confined to `dist/`.

### Denial of Service

The portal depends on bounded provider OIDC discovery/exchange and Runtime
responsiveness. The compatibility JWT path's provider JWKS fetches use bounded
timeouts, incrementally enforced byte ceilings, cache lifetime, coalesced
refresh, and a bounded unknown-key refresh interval. Runtime responses are read
incrementally through a one-MiB ceiling. Login, read, and revoke do not retry
unboundedly. Private deployment visibility reduces public reachability but does
not replace these bounds.

### Elevation of Privilege

The only Mission 3 role is the exact server-registered `executive` role with
`executive_session.read` and `executive_session.revoke`. Authentication,
registration, role, scope, capability health, or a successful handshake must
never create a Decision, Mission, approval, Authority Grant, or action
authorization. Any injected or elevated claim is rejected. Operational actions
continue to require their independent governance, verified Authority, explicit
authorization, receipt, and postcondition.

## Mission 3 required negative matrix

Verification covers callback transaction absence, tamper, expiry, state
mismatch, configuration drift, and cookie-purpose substitution; wrong host,
wrong deployment mode, missing or non-HTTPS forwarding; issuer/audience
mismatch; missing, future, or stale `auth_time`; forged identity headers;
provider-session confidentiality, tamper, expiry, and configuration drift; and
the bootstrap-cookie transition into the final exact Runtime verification.
The compatibility JWT path additionally covers forged signatures, unsupported
algorithms, unknown keys, and expired/not-yet-valid or overlong tokens.
Registration and Runtime verification cover bare or client-selected identity
claims, unknown/inactive/duplicate registration, raw subject retention,
tenant/workspace/role/scope mismatch, policy ID/version/digest mismatch,
session-version and revocation-checkpoint mismatch, expired/revoked cookies,
assertion replay, assertion expiry, executive-session CSRF failure, provider
logout GET/cross-origin/no-session rejection, active-session logout interlock,
and Authority/Decision/Mission/action injection. Each rejection must be
sanitized and must preserve `secretValuesExposed=false`.
