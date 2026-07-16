# Failure Modes

These presentation states follow the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md) and do not replace authoritative Runtime truth.

| Condition | Gateway state | Browser behavior |
| --- | --- | --- |
| Network or hosted runtime failure | Unavailable | Runtime Unavailable, last success, last refresh, and retry state |
| Request exceeds timeout | Timed Out | Explicit timeout; no indefinite browser wait |
| Runtime rejects server token | Unauthorized | Credential failure without exposing the token |
| Unsupported runtime version | Version Mismatch | Response rejected; no data forwarded |
| Unsupported schema | Schema Mismatch | Response rejected; no data forwarded |
| Invalid or oversized response | Unknown | Response rejected; no unvalidated data forwarded |
| Refresh failure with validated cached value | Degraded | Last validated response marked stale |

Errors are never cached. The portal never silently switches to local or generated data.
