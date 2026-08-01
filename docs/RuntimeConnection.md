# Runtime Connection

This connection model is governed by the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

Runtime discovery uses `COMMAND_PORTAL_RUNTIME_API_BASE_URL`; production defaults to `https://nexus-runtime-dev.fly.dev`. Only the public origin is exposed for the Runtime Information view.

The lifecycle states are Connecting, Healthy, Degraded, Unavailable, Retrying, Timed Out, Version Mismatch, Schema Mismatch, Unauthorized, and Unknown. The portal presents every state explicitly.

Transient network, 429, and 5xx failures receive up to three bounded attempts. Authorization, schema, version, validation, and response-size failures are not retried. The server records the last successful connection and refresh timestamps. The browser retains the last validated screen during partial failure but never creates replacement values.

The Runtime-owned Capability Registry supplies GitHub connector guidance and
three non-invocable, fixed read operations: repository metadata for
`chris-dfy/nexus-assistant`, the exact deployed commit, and Actions workflow
runs filtered by that commit. The Experience Gateway displays their handler,
schema, fixed target, current verification age, limitations, and receipt
references without creating a second capability registry.

Runtime provisioning uses `GITHUB_TOKEN` only in the Fly
`nexus-runtime-dev` secret boundary. A fine-grained token is restricted to
`chris-dfy/nexus-assistant` with Metadata read-only (implicit), Contents
read-only, and Actions read-only. No additional permission, write permission,
or access to any other repository is required.
