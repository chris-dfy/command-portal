# Application Shell

This Experience Layer guidance follows the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

The shell has five durable regions:

1. Command header: Hosted Runtime, environment, Gateway, Runtime, version, and refresh.
2. Independent health bar: Gateway Health, Runtime Health, Provider Registry, Environment, Connection, Version, and Diagnostics.
3. Failure banner: last successful connection, last refresh, and retry state without replacement data.
4. Navigation: Document Intelligence, Nexicron Projects, Voice Operator, Runtime Information, Health & Diagnostics, Runtime Topology, Providers, and Proofs & Receipts.
5. Main workspace and compact truth-boundary footer.

Hosted observation refresh performs the exact same-origin GET allowlist with cache invalidation. Local-first workspaces submit only validated inputs through the same-origin `/api/local` allowlist. They display the resulting evidence, limitations, approval state, proof, and receipts without implementing Runtime context assembly or operational decisions in the client.
