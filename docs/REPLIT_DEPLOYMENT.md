# Hosted Portal Deployment

This deployment follows the boundaries defined by the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

Configure these server-only secrets and variables in the hosting environment:

- `COMMAND_PORTAL_RUNTIME_API_BASE_URL=https://nexus-runtime-dev.fly.dev`
- `COMMAND_PORTAL_RUNTIME_READ_TOKEN` as a scoped server secret
- `NEXUS_CONTEXT_ASSERTION_COMMAND_PORTAL_SECRET` as a randomly generated, minimum-32-character Command Portal-only secret stored under the matching Runtime key ID `context-assertion-command-portal-v1`
- `COMMAND_PORTAL_CONTEXT_PRINCIPAL_ID=command-portal-observer` as a non-human service principal used only when no authenticated operational session is present
- `COMMAND_PORTAL_REQUEST_TIMEOUT_MS=8000`
- `COMMAND_PORTAL_REASONING_TIMEOUT_MS=35000`
- `COMMAND_PORTAL_CACHE_TTL_MS=15000`
- `COMMAND_PORTAL_MAX_RESPONSE_BYTES=1048576`

The general 1 MiB response limit remains unchanged. The exact
`/api/runtime/capability-registry` read has an isolated 4 MiB ceiling because
the measured compact canonical projection exceeds 1 MiB; this exception is
not configurable and does not apply to any other route.

GitHub repository and CI verification is Runtime-owned. Do not provision
`GITHUB_TOKEN` in Replit or expose it to the Experience Gateway or browser.
The existing token belongs only in the Fly `nexus-runtime-dev` secret
boundary, is limited to `chris-dfy/nexus-assistant`, and needs only:

- Metadata: read-only (implicit);
- Contents: read-only; and
- Actions: read-only.

The Gateway renders the Runtime-owned fixed read contract: repository
metadata, the exact deployed commit, and workflow runs filtered to that
commit. It does not require any additional permission, write access, or
broader repository access.

To enable the fixed-workspace Hosted Operational Gateway, publish the app as a **Workspace only** private deployment, provision every server-only operational variable from `.env.example`, deploy the execution Runtime behind HTTPS, and provision the matching Runtime token, tenant, workspace, and fixed service bindings:

- `NEXUS_HOSTED_OPERATIONAL_TOKEN` matches `COMMAND_PORTAL_OPERATIONAL_RUNTIME_TOKEN`;
- `NEXUS_HOSTED_TENANT_ID` matches `COMMAND_PORTAL_TENANT_ID`;
- `NEXUS_HOSTED_WORKSPACE_ID` matches `COMMAND_PORTAL_WORKSPACE_ID`;
- `NEXUS_HOSTED_SERVICE_ID` matches `COMMAND_PORTAL_OPERATOR_USER_ID`;
- `NEXUS_HOSTED_SERVICE_ROLE` matches `COMMAND_PORTAL_OPERATOR_ROLE`; and
- `NEXUS_HOSTED_SERVICE_SCOPES` matches the Gateway's canonical, deduplicated `COMMAND_PORTAL_OPERATIONAL_SCOPES` value in lexicographic order. Scope order is part of the fail-closed Runtime identity corroboration contract.

Published Replit deployments select the automatic workspace-session contract from Replit's predefined `REPLIT_DEPLOYMENT=1` marker and require the exact `REPLIT_DOMAINS` binding, HTTPS, and a same-origin browser request. The browser receives only a signed HttpOnly session cookie and CSRF token; it never receives or submits an operator access key. Non-Replit development retains the explicit `access_key` compatibility mode.

Never enable operational mode while any ingress or fixed-binding value is absent or mismatched. This is a fixed workspace-service compatibility boundary, not individual human identity, enterprise identity, multi-user RBAC, or an Authority Grant. `productionMultiTenantReady` remains `false`.

## Registered Executive session

Mission 3 adds a separate, non-production human session. It does not replace or
reinterpret the Hosted Operational Gateway service session. The human principal
is `registered_human_executive`; the Gateway remains the distinct
`experience_gateway_service` principal.

Provision Replit Auth through Replit Agent and retain its server-side OIDC
authorization-code path. Replit documents Agent as the supported provisioning
path for Replit Auth. The Gateway accepts the interactive session only on the
exact provider-owned `REPLIT_DEV_DOMAIN` during development or a published
`REPLIT_DOMAINS` host, with issuer `https://replit.com/oidc`, audience
`REPL_ID`, PKCE, state, nonce, bounded `max_age`, and signed `auth_time`.
Forged identity headers do not participate in this mode. Until the deployed
flow passes the real login and forged-header/host negative matrix, the Gateway
remains `configured_not_verified`; injected OIDC tests are source evidence
only.
The browser POSTs an empty body to `/api/executive-session/login`; it never
submits a provider subject, tenant, workspace, role, scope, policy, or provider
token. The stable opaque provider subject is hashed into a provider binding and
mapped only through `COMMAND_PORTAL_EXECUTIVE_REGISTRATIONS_JSON`, a
server-owned non-production registration.

Configure the Mission 3 names listed in `.env.example` through the Replit
deployment configuration and secret manager. Secret values must never be
placed in `.replit`, repository files, browser-visible `VITE_` variables,
deployment receipts, logs, or operator transcripts. The three purpose-bound
secret values are:

- `COMMAND_PORTAL_PROVIDER_SESSION_SECRET`, used only to
  authenticated-encrypt the short-lived provider session and transaction
  cookies;
- `COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET`, used only to sign the
  short-lived HttpOnly browser session cookie; and
- `NEXUS_HUMAN_SESSION_ASSERTION_SECRET`, shared only with the Runtime to sign
  the at-most-60-second, single-use human-session assertion.

Their provider references and public key IDs are
`COMMAND_PORTAL_PROVIDER_SESSION_SECRET_REF`,
`COMMAND_PORTAL_PROVIDER_SESSION_KEY_ID`,
`COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_SECRET_REF`,
`COMMAND_PORTAL_EXECUTIVE_SESSION_COOKIE_KEY_ID`,
`NEXUS_HUMAN_SESSION_ASSERTION_SECRET_REF`, and
`NEXUS_HUMAN_SESSION_ASSERTION_KEY_ID`. Inspect and record only names, key IDs,
presence, and provider metadata. Do not read values. The provider-session
secret, Registered Executive cookie secret, human-assertion secret, Hosted
Operational session secret, Runtime bearer tokens, and Mission 1
Command Portal context-assertion secret must be purpose-bound, client-specific, and distinct.

The implementation supports a fail-closed recovery/bootstrap configuration in
which `COMMAND_PORTAL_PROVIDER_INTERACTIVE_AUTH_ENABLED=true` while
`COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED=false`: provider login may establish
only the encrypted provider session and every Registered Executive route
remains disabled. The Mission 3 deployment does not use that mode for an early
interactive login. It derives the opaque registration binding in server memory
from the already-authenticated provider control-plane session, retains neither
the raw subject nor the resulting binding in operator output, and configures
the same server-owned registration in both provider secret managers before
deployment. Runtime is then deployed first and Experience second, followed by
one fresh interactive login within the five-minute provider-authentication
bound. Provider sign-out is a same-origin POST, refuses while an active NEXUS
session exists, and requires the NEXUS session to be revoked through its
CSRF-protected Runtime route first.

The accepted policy binding is immutable for this Mission:

- ID: `registered-executive-session-policy`
- version: `1.0.0`
- digest:
  `sha256:b1f6a2cdf2153ac48236867e5e1aeab794842256410f3f314fc2655008a2be78`

Deploy the named non-production Runtime first, then the Experience Gateway.
The Runtime registration and policy digest, the Gateway registration, Replit
issuer, tenant, workspace, role, scopes, session version, revocation checkpoint,
service binding, client ID, key ID, issuer, and audience must match exactly.
Perform one interactive Replit login only after both deployments report the
expected commit and image identities.

Acceptance requires a positive login/read/revoke lifecycle and negative tests
for forged and browser-selected claims, unknown registration, issuer, audience,
signature, algorithm, key, replay, expiry, revocation, session version,
revocation checkpoint, policy ID/version/digest, tenant, workspace, role,
scope, and Authority injection. Every rejection must fail closed without
creating a Decision, Mission, Authority Grant, approval, or action
authorization.

Rollback is additive and reversible: set
`COMMAND_PORTAL_EXECUTIVE_SESSION_ENABLED=false` and
`COMMAND_PORTAL_PROVIDER_INTERACTIVE_AUTH_ENABLED=false`, restore the accepted
Mission 2 Runtime and Experience releases, and verify that the Mission 2
service handshake still passes. Retain the purpose-bound secrets and
registration as inactive provider metadata unless compromise is proven; do not
rotate or delete them merely because a release was superseded. Record the
rolled-back release identities and revocation status in the sanitized receipt.

Build with `npm run build` and start with `npm run start`. Never create a browser-visible `VITE_` runtime variable. After deployment, verify every allowlisted route, mutation rejection, secret isolation, failure rendering, and the live topology.

## Governed Realtime voice promotion gate

Every Command Portal promotion that can expose voice must run an authenticated synthetic browser canary through the published Experience Gateway, not directly against Runtime. The canary must first negotiate the exact `nexus.realtime-voice@2.0.0` contract and `trackless-pcm-transcription-v1` profile, then prove the browser activation sequence: readiness, `getUserMedia`, one live microphone track, 24 kHz PCM capture, analyser activity, an inactive trackless audio SDP offer, the Gateway `POST /api/runtime/realtime/call`, connected peer transport, and open ordered data channel.

The successful SDP response must bind the current deployment to the exact Runtime artifact identity and a verified Realtime receipt digest. The promotion record must bind the root/program source commit, Runtime source commit, immutable carrier, composed-source digest, image or artifact digest, contract version, deployment identity, and those postconditions. A receipt from an earlier artifact or deployment is historical evidence only and cannot satisfy current readiness.

No governed SDP call, no current-artifact receipt, or no verified audio postconditions means the promotion is blocked or rolled back. Push-to-talk remains continuity-only and cannot satisfy this gate. Unknown or masked Runtime errors fail closed with only a bounded safe reason code and request ID. The published UI must report Runtime reachable, Runtime ready, voice contract ready, provider connected, production ready, and live connection established separately; it must never derive one from another or report live voice before `connectionState=live`.

For the earlier Mission 1 tenant-context assertion rollout, deploy in this
order: first add that context-assertion secret to this portal and republish it
so text and voice already carry the signed header; then deploy Runtime with the
provisioned tenant registry, matching context-assertion secret, and assertion
verification. The earlier Runtime safely ignores the additional Mission 1
header. Rotating any assertion secret requires coordinated dual-secret support
or a bounded maintenance window; changing only one side after verification is
active will correctly fail closed. Mission 3 keeps the Runtime-first order
specified above.
