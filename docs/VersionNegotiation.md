# Version Negotiation

This compatibility boundary follows the [NEXUS Platform Constitution](architecture/NEXUS_Platform_Constitution.md).

The Experience Gateway supports Runtime schema `1.0.0` and Runtime compatibility line `0.1.x`, represented by portal baseline `0.1.0`.

Every Runtime response must include `status`, `timestamp`, `schemaVersion`, `runtimeVersion`, `proofIds`, `limitations`, and `data`. Missing or invalid fields prevent forwarding.

An unsupported schema produces Schema Mismatch. A Runtime outside the supported major/minor compatibility line produces Version Mismatch. These failures are not retried or cached, and the browser receives no runtime data from the rejected response.
