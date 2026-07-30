# NEXUS Experience Gateway

This component definition is governed by the [NEXUS Platform Constitution](NEXUS_Platform_Constitution.md).

The NEXUS Experience Gateway is the official server-side boundary between NEXUS clients and the NEXUS Runtime Gateway. It supports Operational Engagement and is the only runtime communication path available to a browser or other client.

## Communication flow

```text
Executive User
    ↓
Command Portal
    ↓
Experience Gateway
    ↓
Runtime Gateway
    ↓
Runtime
    ↓
Provider Router
    ↓
Provider Registry
    ↓
AI Providers
```

The Command Portal communicates only with the NEXUS Experience Gateway. The NEXUS Experience Gateway communicates with the NEXUS Runtime Gateway. No client communicates directly with the NEXUS Runtime Gateway, NEXUS Runtime, Provider Router, Provider Registry, or AI Providers.

## Responsibilities

The NEXUS Experience Gateway performs request validation, response validation, schema validation, caching, bounded retry, timeout handling, health monitoring, connection lifecycle management, version negotiation, structured logging, and graceful degradation. It exposes only fixed routes explicitly registered for a client. For Runtime-governed interaction routes, it may assert a provisioned tenant and request principal with a short-lived signed token; it never assembles tenant Operational Context itself.

For the non-production Registered Executive session, the Gateway also verifies
an external human-authentication result, maps the stable opaque provider subject
through a server-owned registration, signs a bounded browser session, and sends
a distinct single-use human-session assertion to the Runtime. The Gateway may
verify identity; only the Runtime admits and records the canonical session.

## Boundaries

The gateway is not the NEXUS Runtime, Runtime API, Provider Router, or Provider Registry. It does not execute workflows, select providers, strengthen capability claims, or create Runtime proof or receipt records. Session verification and revocation use only their fixed Runtime endpoints; they do not admit a mission or action. Runtime endpoints, environment variables, deployment identities, and repository names outside the versioned Mission 3 contract remain unchanged.

## Security model

Runtime tokens, cookie-signing secrets, context-assertion secrets, and
human-session assertion secrets remain server-only. The browser never receives
runtime tokens, provider credentials, internal routing, runtime secrets,
authorization headers, assertion tokens, provider subjects, or server
configuration. Browser-supplied identity, tenant, workspace, role, scope,
policy, session-version, revocation, and Authority fields are rejected or
ignored. The gateway rejects arbitrary forwarding, unknown routes, query
parameters, oversized bodies, unsafe origins, and unallowlisted methods before
contacting the NEXUS Runtime Gateway.

The Replit path uses a server-side, provider-neutral authentication adapter
backed by Replit Auth. An Agent-provisioned verifier is preferred; the strict
JWT/JWKS adapter permits only the configured issuer and audience, advertised
`RS256` or `PS256` with algorithm-specific RSA padding, a known key ID, valid
signature and times, bounded lifetime, opaque subject, and verified
authentication methods. Bare Replit user headers and client privilege claims
are never identity evidence.

Until Replit Agent provisions and wires the deployed server verifier, the
provider state is `configured_not_verified`; local injected-verifier tests are
not evidence of a live provider handshake.

The provider subject is never stored in the session, response, receipt, or log.
Its deterministic server-side binding selects exactly one active registration.
That registration, not the browser, fixes the principal ID, tenant, workspace,
`executive` role, `executive_session.read` and
`executive_session.revoke` scopes, policy binding, session version, revocation
checkpoint, and maximum lifetime.

## Runtime relationship

The NEXUS Runtime Gateway remains the authoritative request boundary for the
NEXUS Runtime. Mission 1 context assertions and Mission 3 human-session
assertions are different contracts, headers, keys, and replay domains. For the
human session, the Runtime first authenticates the Gateway service bearer,
then verifies the assertion signature, key ID, issuer, audience, service and
client bindings, lifetime of at most 60 seconds, single-use `jti`, exact
registration and policy, and non-Authority claims. Runtime responses remain
authoritative only after the Experience Gateway validates the complete
canonical session envelope.

## Registered Executive lifecycle

```text
Replit Auth → server verification → server-owned registration
            → signed HttpOnly session → single-use Runtime assertion
            → canonical Runtime session + receipt
```

- `POST /api/executive-session/login` accepts only `{}`. It verifies the
  provider identity and registration, then requires the Runtime verify
  postcondition before setting the browser cookie.
- `GET /api/executive-session` reads the HttpOnly cookie and returns only a
  Runtime-validated canonical session or a sanitized absent/failure state. A
  fresh single-use human-session assertion with the registered read scope is
  required at the Runtime boundary.
- `POST /api/executive-session/revoke` accepts only `{}` plus the in-memory
  CSRF value, requires a fresh Runtime assertion, clears the local cookie, and
  exposes no credential material.

Human identity, Gateway service identity, tenant/workspace binding, session,
policy, role/scopes, Decision, Mission, Authority, and action authorization are
separate records or boundaries. An active Registered Executive session sets
`authorityGranted=false`, `actionAuthorized=false`,
`missionExecutionAdmitted=false`, and creates no Decision or Mission.

## Future client support

Every future client connects to a NEXUS Experience Gateway rather than directly to the NEXUS Runtime Gateway. This includes:

- Replit Portal
- Desktop NEXUS Command
- Mobile
- Government Portal
- Customer Portal
- Future Web Portal
- Edge UI

Different clients may receive distinct presentation contracts or deployment boundaries, but none may bypass the NEXUS Experience Gateway.
