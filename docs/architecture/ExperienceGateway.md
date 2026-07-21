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

## Boundaries

The gateway is not the NEXUS Runtime, Runtime API, Provider Router, or Provider Registry. It does not execute workflows, mutate runtime state, select providers, strengthen capability claims, or create proof or receipt records. Runtime endpoints, environment variables, deployment identities, and repository names remain unchanged.

## Security model

Runtime tokens and the tenant-context assertion secret remain server-only. The browser never receives runtime tokens, provider credentials, internal routing, runtime secrets, authorization headers, tenant assertion tokens, or server configuration. Browser-supplied tenant identity fields are discarded. The gateway rejects arbitrary forwarding, unknown routes, unsafe queries, and mutation methods before contacting the NEXUS Runtime Gateway.

## Runtime relationship

The NEXUS Runtime Gateway remains the authoritative request boundary for the NEXUS Runtime. It verifies the assertion signature, audience, tenant allowlist, lifetime, client binding, and single-use identifier before selecting a tenant profile. It then assembles the eight Runtime context domains and returns a minimized context summary. Runtime responses remain authoritative only after the Experience Gateway validates their envelope and compatibility.

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
