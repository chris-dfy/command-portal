# Truth Boundaries

These truth boundaries are required by the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

The Experience Gateway and browser preserve:

- `productionReady=false`
- `enterpriseReady=false`
- `cloudPrimary=false`
- `localSourceOfTruth=true`
- `defaultProvider=mock_model`
- `conclave=available_bounded_review`: structured Runtime challenge and synthesis is available; independent model participation and execution authority remain false.
- `actualTrainedSLMs=0`
- `secretValuesExposed=false`

Hosted transport does not imply production or enterprise readiness. Configured providers do not imply reachability, verification, trained-model knowledge, or live inference. Runtime failure reports absence and never backfills values.
