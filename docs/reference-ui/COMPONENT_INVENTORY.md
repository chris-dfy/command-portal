# Component Inventory

Component ownership follows the [NEXUS Platform Constitution](../architecture/NEXUS_Platform_Constitution.md).

| Component | Purpose | Data behavior |
| --- | --- | --- |
| Command header | Hosted source, environment, Gateway, Runtime, version | Validated gateway metadata |
| Executive status bar | Seven independent health signals | Never collapses into one status |
| Runtime Information | Discovery, capabilities, truth, limitations | Validated Runtime responses only |
| Health & Diagnostics | Lifecycle and component checks | Required and informational checks remain visible |
| Runtime topology | Portal-to-provider live path | Health derived at every node |
| Provider registry | Provider configuration and verification | Does not infer live inference |
| Proofs & Receipts | Runtime evidence references | Always bypasses cache |
| Failure banner | Unavailability, timestamps, retry state | Never substitutes generated data |
