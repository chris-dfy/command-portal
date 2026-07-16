# Runtime Connection

This connection model is governed by the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

Runtime discovery uses `COMMAND_PORTAL_RUNTIME_API_BASE_URL`; production defaults to `https://nexus-runtime-dev.fly.dev`. Only the public origin is exposed for the Runtime Information view.

The lifecycle states are Connecting, Healthy, Degraded, Unavailable, Retrying, Timed Out, Version Mismatch, Schema Mismatch, Unauthorized, and Unknown. The portal presents every state explicitly.

Transient network, 429, and 5xx failures receive up to three bounded attempts. Authorization, schema, version, validation, and response-size failures are not retried. The server records the last successful connection and refresh timestamps. The browser retains the last validated screen during partial failure but never creates replacement values.
