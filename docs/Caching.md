# Caching

This behavior follows the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md), under which caching belongs to the NEXUS Experience Gateway and never becomes operational truth.

Only successful, validated read-only responses may enter the short non-authoritative in-memory cache. Status, version, providers, capabilities, environment, governance, and connectors are cacheable.

Health, readiness, diagnostics, proofs, and receipts always bypass the cache. Tokens, credentials, authorization, errors, mutations, and execution state are never cached.

Every gateway response exposes `lastRefresh`, `age` in milliseconds, `stale`, `expires`, and `cached`. A browser refresh sends `Cache-Control: no-cache`, which invalidates the route entry before fetching. Expiry also triggers revalidation. If revalidation fails, an existing validated entry may be served as stale with `Degraded` connection state and an explicit warning.
