# Architecture Glossary

## Canonical terms

| Term | Meaning |
| --- | --- |
| Operational Understanding Platform | The canonical architectural identity of NEXUS. |
| Runtime Foundation | Shared platform substrate: host, registries, eventing, identity, configuration, health, plugins, providers, memory, and APIs. |
| Operational Understanding Loop | Observe → Interpret → Correlate → Understand → Validate → Authorize → Coordinate → Communicate → Learn → Observe. |
| Operational Capability | A composable Runtime responsibility that contributes to the loop. |
| Operational Object | A shared, governed object carried through the loop. |
| Operational Observation | Capability answering “What is happening?” |
| Operational Understanding | Capability answering “What does it mean?” |
| Operational Validation | Capability answering “How certain are we?” |
| Operational Authority | Capability answering “What are we allowed to do?” |
| Operational Orchestration | Capability answering “What should happen next?” |
| Operational Engagement | Capability answering “How should this be communicated?” |
| Executive Operating Loop | Executive-facing visualization of the broader Operational Understanding Loop. |
| Executive Operational Experience | Client presentation of the Executive Operating Loop through Runtime-owned contracts. |
| Knowledge | Static facts with explicit source classification. |
| Understanding | Dynamic, time-bounded interpretation of operational state. |

## Legacy terminology mapping

| Historical term | Canonical successor | Compatibility note |
| --- | --- | --- |
| Integration Layer | Operational Observation | Existing files, namespaces, routes, and schema identifiers may retain the historical name. |
| Intelligence Layer | Operational Understanding | “Intelligence” may describe a feature, but Operational Understanding is the architectural term. |
| Conclave Layer | Operational Validation | NEXUS Conclave remains a permanent component name within this capability. |
| Governance Layer | Operational Authority | Governance remains a mechanism and service responsibility. |
| Execution Layer | Operational Orchestration | Execution remains a bounded activity and verified lifecycle state. |
| Experience Layer | Operational Engagement | Clients still own presentation; Runtime owns semantic engagement behavior. |
| Six-layer architecture | Operational Understanding Platform | Use only for historical references or explicit compatibility notes. |

Historical source material should remain labeled as historical rather than rewritten as if it were current architecture.
