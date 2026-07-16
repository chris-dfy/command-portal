# Browser Envelope

This presentation contract follows the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

Successful responses contain:

- `ok=true`
- validated Runtime `data`
- Runtime status, timestamp, schema version, runtime version, limitations, and proof references
- Experience Gateway health, connection state, safe public Runtime URL, last-success timestamps, retry count, and cache state
- preserved truth boundaries

Failures contain `data=null`, no Runtime envelope, normalized error code/message, and gateway connection diagnostics. Credentials, authorization headers, secret values, and internal runtime paths are never present.
