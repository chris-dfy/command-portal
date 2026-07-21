# Operational Capabilities

Operational Capabilities are the primary architectural building blocks of NEXUS. They contribute to one or more stages of the Operational Understanding Loop and consume or produce versioned Operational Objects.

| Capability | Primary question | Purpose | Primary inputs | Primary outputs | Dependencies | Runtime ownership |
| --- | --- | --- | --- | --- | --- | --- |
| Operational Observation | What is happening? | Acquire and normalize registered signals from systems, people, files, telemetry, and connectors. | Sources, events, connector results | Signals, Entities, source metadata | Runtime Foundation, Connector Registry | Runtime owns source registration, ingestion truth, and provenance; clients may capture input only. |
| Operational Understanding | What does it mean? | Interpret and correlate observations into bounded operational meaning. | Signals, Entities, Context, prior Learning | Context, Situations, Assessments | Observation, context services, memory, evidence | Runtime owns assembly and interpretation; model-native reasoning is labeled and non-authoritative. |
| Operational Validation | How certain are we? | Challenge assessments, expose dissent, test evidence, and qualify confidence. | Assessments, Context, evidence, policy constraints | Validated Assessments, challenges, uncertainty | Understanding, proof services, Conclave | Runtime owns validation records; validation does not authorize execution. |
| Operational Authority | What are we allowed to do? | Apply identity, policy, authority, approval, risk, and governance constraints. | Validated Assessments, proposed Decisions and Actions | Authorized, denied, or pending Decisions | Identity, policy, governance, proof | Runtime owns authority; clients never infer permission. |
| Operational Orchestration | What should happen next? | Plan, sequence, coordinate, and verify bounded work. | Authorized Decisions, capability state, connector state | Action plans, Actions, receipts, outcomes | Authority, capability registry, execution services | Runtime owns orchestration and execution truth; completion requires receipts and verification. |
| Operational Engagement | How should this be communicated? | Shape governed interaction, briefings, explanations, and audience-appropriate presentation. | Assessments, Decisions, Actions, interaction state | Interaction events, narratives, briefings, presentation contracts | All relevant capabilities, HIF, client contracts | Runtime owns semantic behavior; clients own visual, audio, and interaction presentation. |

## Capability rules

- Capabilities are composable and may participate in multiple loop stages.
- A capability does not become available merely because a route, provider, or UI control exists.
- Capability state must be registered, configured, authorized, tested, deployed, verified, and linked to evidence.
- Capability boundaries must preserve Operational Object provenance and authority.
- Knowledge is static fact; Operational Understanding is dynamic, time-bounded interpretation.

## Historical mapping

The former layer names map conceptually to these capabilities for documentation compatibility only. See [Architecture Glossary](Architecture_Glossary.md). The mapping does not authorize API, schema, namespace, or database renames.
