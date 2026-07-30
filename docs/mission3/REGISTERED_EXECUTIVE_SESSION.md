# Mission 3 Registered Executive Session

## Governing pins

- Constitutional Registry release: `NCR-1.0.0`
- release digest:
  `sha256:212678643019c07c38d11c6abf4b4810fb87b5b8cf543b6ccdc958dcb9bdaffa`
- official publication digest:
  `sha256:26a405ff76a5ae001a8d0ddff1069cb00870c240b8fb26148273ff031a819b4a`
- resolved principle-set digest:
  `sha256:b59a620a0fb97ab8459fbd09049d16defb0a37e1402f3ca7a173f44536d5d98a`
- constitutional basis digest:
  `sha256:4fc6c66378c3094a8904149b6b5ac92f3494ff885768943aad907c1467ac3daa`
- immutable evidence-bundle digest:
  `sha256:9ccfc84f2da002ea303fda282915e92833d56452f6aa30f63ca1f103b47ddf27`
- session policy: `registered-executive-session-policy@1.0.0`
- policy digest:
  `sha256:b1f6a2cdf2153ac48236867e5e1aeab794842256410f3f314fc2655008a2be78`

Applicable principle families include constitutional identity and traceability,
source/evidence truth, human agency and approval, separation of identity and
Authority, fail-closed security, bounded execution, secrets handling, receipts,
postconditions, revocation, and Operational Replay. This work implements and
verifies those boundaries; it does not change the constitution or declare a
production capability.

Applicable principle IDs resolved before implementation:
`NCR-CON-0002`, `NCR-CON-0006`, `NCR-CON-0009`, `NCR-CON-0017`,
`NCR-CON-0018`, `NCR-CON-0019`, `NCR-CON-0020`, `NCR-CON-0021`,
`NCR-CON-0022`, `NCR-CON-0026`, `NCR-CON-0027`, `NCR-CON-0028`,
`NCR-CON-0031`, `NCR-ARC-0002`, `NCR-ARC-0003`, `NCR-ARC-0008`,
`NCR-ARC-0011`, `NCR-ARC-0012`, `NCR-ARC-0017`, `NCR-ARC-0020`,
`NCR-ENG-0003`, `NCR-ENG-0006`, `NCR-ENG-0008`, `NCR-ENG-0015`,
`NCR-ENG-0021`, `NCR-OPS-0004`, `NCR-OPS-0010`, `NCR-OPS-0011`,
`NCR-OPS-0012`, `NCR-OPS-0013`, `NCR-OPS-0017`, `NCR-OPS-0018`,
`NCR-OPS-0020`, `NCR-OPS-0022`, `NCR-OPS-0029`, `NCR-EXE-0001`,
`NCR-EXE-0005`, `NCR-EXE-0007`, `NCR-EXE-0008`, and `NCR-EXE-0013`
(`NCR-OPS-0004@1` supplies freshness semantics). The exact Mission 3
constitutional basis is 65 direct / 79 resolved principles. The canonical root
Principle Impact Record carries the per-principle disposition and executable
evidence; this Experience document retains the governing pins with the code.

## Accepted boundary

Mission 3 establishes one non-production human Executive session:

1. Replit Auth verifies a human identity server-side through a provider-neutral
   adapter.
2. A stable opaque provider subject maps to one active, server-owned
   registration. Raw provider subjects are neither retained nor exposed.
3. The registration fixes principal, tenant, workspace, role, scopes, policy,
   session version, revocation checkpoint, and maximum lifetime.
4. The Experience Gateway issues a signed, `HttpOnly`, `Secure`,
   `SameSite=Strict` browser cookie and keeps CSRF state in browser memory only.
5. For verify, read, and revoke, the authenticated Gateway service signs a
   fresh, distinct, at-most-60-second, single-use human-session assertion.
6. The Runtime validates the exact registry and policy, consumes the assertion
   once, records the canonical session, replay/revocation lineage, and receipt,
   and returns the complete envelope for Gateway validation.

The browser supplies no identity or privilege selector and retains no provider
token or provider subject. Human principal, Gateway service principal,
tenant/workspace, session, policy, role/scopes, Decision, Mission, Authority,
and action authorization remain separate. A valid session explicitly records
no Decision, no Mission, no Authority Grant, no approval, and no action
authorization.

## Configuration names

Secret values exist only in the Replit and Fly secret managers. Sanitized
receipts may record the following names, public key IDs, presence, and provider
metadata:

- `COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET_REF`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_KEY_ID`
- `NEXUS_HUMAN_SESSION_ASSERTION_SECRET`
- `NEXUS_HUMAN_SESSION_ASSERTION_SECRET_REF`
- `NEXUS_HUMAN_SESSION_ASSERTION_KEY_ID`

The non-secret bindings are:

- `COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_TTL_SECONDS`
- `COMMAND_PORTAL_COOKIE_SECURE`
- `COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_ISSUER`
- `COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_AUDIENCE`
- `COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_TTL_SECONDS`
- `COMMAND_PORTAL_HUMAN_SESSION_SERVICE_BINDING_ID`
- `COMMAND_PORTAL_HUMAN_SESSION_ASSERTION_CLIENT_ID`
- `COMMAND_PORTAL_REPLIT_AUTH_ISSUER`
- `COMMAND_PORTAL_REPLIT_AUTH_AUDIENCE`
- `COMMAND_PORTAL_REPLIT_AUTH_JWKS_URL`
- `COMMAND_PORTAL_REPLIT_AUTH_TOKEN_HEADER`
- `COMMAND_PORTAL_REPLIT_AUTH_CLOCK_SKEW_SECONDS`
- `COMMAND_PORTAL_REPLIT_AUTH_MAX_TOKEN_LIFETIME_SECONDS`
- `COMMAND_PORTAL_REPLIT_AUTH_JWKS_TIMEOUT_MS`
- `COMMAND_PORTAL_REPLIT_AUTH_JWKS_CACHE_SECONDS`
- `COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_ID`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_VERSION`
- `COMMAND_PORTAL_EXECUTIVE_SESSION_POLICY_DIGEST`

Mission 1 trust bootstrap remains independently configured. The Runtime bearer,
Mission 1 context assertion, Mission 3 browser cookie, and Mission 3 human
assertion use distinct secrets and key IDs.

Source completion leaves provider state `configured_not_verified` until Replit
Agent provisions the supported Replit Auth integration and wires its
server-side verifier into the deployed `createPortalServer` entrypoint. The
strict JWT/JWKS fallback is usable only when an authenticated provider
integration supplies the configured token header; the NEXUS browser client
does not manufacture or retain that token. A real login cannot satisfy the
Mission gate before this wiring and one provider-authenticated human
interaction are verified.

## Verification

Local acceptance runs:

```bash
node --test tests/registered-executive-session.test.mjs
npm run build
npm test
npm run verify:build
```

The live gate deploys Runtime first and Experience Gateway second, confirms the
exact commits and image digests, completes one positive login/read/revoke
lifecycle, and executes every negative case named in `threat_model.md`.
Acceptance evidence contains only identifiers, digests, timestamps, result
codes, secret names/key IDs/presence, and rollback targets.

## Rollback

Disable `COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED`, restore the accepted Mission
2 Runtime and Experience releases without rewriting history, and rerun the
Mission 2 service handshake and trust negatives. Retain Mission 3 registrations,
secret-manager entries, and receipts as inactive historical evidence unless a
proven compromise requires rotation. Record active-session revocation state and
the exact restored release/image identities. No release, receipt, competing
commit, or unrelated work is deleted.
