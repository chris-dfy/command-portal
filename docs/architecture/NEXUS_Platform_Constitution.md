# NEXUS Platform Constitution

This Constitution is the canonical and authoritative architectural reference for the entire NEXUS Platform. It supersedes informal architectural terminology. Every NEXUS repository, component, prompt, developer, AI agent, documentation artifact, and generated implementation must follow it.

## Platform identity

NEXUS is a platform: the Enterprise eXecutive Unified System. It is not a web application, portal, desktop application, runtime, gateway, API, or mobile application. Those are independent, loosely coupled platform components.

The NEXUS Runtime is authoritative. Operational Engagement clients are presentational.

## Canonical architecture

NEXUS is an Operational Understanding Platform composed of four architectural domains:

1. **Runtime Foundation** — the shared substrate of host, registries, eventing, scheduling, identity, security, configuration, health, plugins, providers, memory, and APIs. It is not an operational capability.
2. **Operational Understanding Loop** — Observe, Interpret, Correlate, Understand, Validate, Authorize, Coordinate, Communicate, Learn, then Observe again.
3. **Operational Capabilities** — Operational Observation, Operational Understanding, Operational Validation, Operational Authority, Operational Orchestration, and Operational Engagement.
4. **Operational Objects** — Signals, Entities, Context, Situations, Assessments, Decisions, Actions, and Learning.

No single component owns the complete loop. Runtime capabilities contribute to it through governed Operational Objects. The Executive Operating Loop is the executive-facing visualization of the broader Operational Understanding Loop, and the Executive Operational Experience is its client presentation.

The former six-layer architecture is historical terminology. Existing implementation names and contracts may retain legacy identifiers for compatibility, but new architecture documentation and planning use the canonical model.

## Official platform stack

```text
Executive User
    ↓
Command Portal
    ↓
NEXUS Experience Gateway
    ↓
NEXUS Runtime Gateway
    ↓
NEXUS Runtime
    ↓
Provider Router
    ↓
Provider Registry
    ↓
AI Providers
```

## Clients

Official and future clients include:

- Command Portal
- Desktop NEXUS Command
- Future Mobile
- Government Portal
- Customer Portal
- Edge Interfaces
- Future Third-Party Integrations

Every client communicates only through the NEXUS Experience Gateway.

## Official component names

| Function | Official name |
| --- | --- |
| User interface | Command Portal |
| Browser-facing service | NEXUS Experience Gateway |
| Runtime ingress | NEXUS Runtime Gateway |
| Authoritative platform | NEXUS Runtime |
| Model abstraction | Provider Router |
| Provider catalog | Provider Registry |
| Evidence | Proof Registry |
| Execution history | Receipt Registry |
| Operational capabilities | Capability Registry |
| Platform knowledge | Knowledge Registry |
| Platform inventory | Asset Registry |
| External integrations | Connector Registry |
| Operational diagnostics | Runtime Diagnostics |
| Operational health | Runtime Health |
| Version | Runtime Version |
| Schema | Schema Version |

## Reserved platform components

The following names are permanent NEXUS platform vocabulary:

- NEXUS Conclave
- NEXUS AI Workforce
- NEXUS Edge Runtime
- NEXUS Policy Engine
- NEXUS Execution Engine
- NEXUS Mission Console
- NEXUS Executive Briefing Engine
- NEXUS Digital Twin
- NEXUS Knowledge Registry
- NEXUS Asset Registry

## Component ownership

### Command Portal

The Command Portal owns visualization, interaction, navigation, accessibility, executive experience, mission views, operational awareness, presentation, topology, and dashboards.

It never owns operational truth, execution, governance, providers, evidence, or policies.

### NEXUS Experience Gateway

The NEXUS Experience Gateway owns runtime communication, connection lifecycle, retry, caching, runtime discovery, health aggregation, diagnostics aggregation, schema validation, version negotiation, and compatibility.

It never owns execution, governance, operational intelligence, policies, or evidence.

### NEXUS Runtime Gateway

The NEXUS Runtime Gateway owns runtime ingress and request validation. It is the boundary for future authentication, authorization, tenant routing, auditing, rate limiting, and API lifecycle management.

### NEXUS Runtime

The NEXUS Runtime exclusively owns operational truth, runtime state, capabilities, knowledge, assets, proofs, receipts, policies, governance, execution, diagnostics, the Provider Router, and the Provider Registry.

No other component owns these concerns.

## Communication model

```text
Browser
    ↓
NEXUS Experience Gateway
    ↓
NEXUS Runtime Gateway
    ↓
NEXUS Runtime
    ↓
Provider Router
    ↓
Provider Registry
    ↓
AI Providers
```

The browser never communicates directly with the NEXUS Runtime, NEXUS Runtime Gateway, Provider Router, Provider Registry, AI Providers, secrets, credentials, or internal routing. Only the NEXUS Experience Gateway communicates with the NEXUS Runtime Gateway.

## Platform terminology

Use the official NEXUS component names. Prefer Experience Gateway, Runtime Gateway, Provider Router, Provider Registry, Mission View, Operational View, and Executive View. Use generic terminology only when no official platform term exists.

Do not use informal substitutes such as the legacy browser-server acronym, frontend proxy, portal proxy, backend API, model manager, model catalog, or provider catalog for official NEXUS components.

Do not introduce additional gateway names.

Use Operational Understanding rather than static “intelligence” terminology when describing dynamic interpretation. Knowledge means static facts with explicit source classification; understanding means a time-bounded interpretation assembled from registered context and evidence.

The six Operational Capabilities own these primary questions:

- Operational Observation: “What is happening?”
- Operational Understanding: “What does it mean?”
- Operational Validation: “How certain are we?”
- Operational Authority: “What are we allowed to do?”
- Operational Orchestration: “What should happen next?”
- Operational Engagement: “How should this be communicated?”

## Truth principles

- The Runtime owns truth.
- Truth flows outward.
- Execution flows inward.
- Evidence accompanies execution.
- Capabilities never exceed evidence.
- Unknown remains unknown.
- Pending remains pending.
- Staged remains staged.
- The platform never exaggerates capability.

## Truth boundaries

Every component must preserve these independent truth boundaries wherever they are represented:

- `productionReady`
- `enterpriseReady`
- `cloudPrimary`
- `localSourceOfTruth`
- Provider verification
- Runtime verification
- Connector verification
- Capability verification
- Conclave state
- SLM count

Capability must never be fabricated.

## Evidence and provisioning doctrine

NEXUS may use authorized model-native knowledge for general reasoning, explanation, drafting, and candidate generation. Model-native knowledge is probabilistic, model-dependent, cutoff-limited, and never proof of current facts, organization-specific facts, runtime capability, or completed work.

Authoritative assets and capabilities must be present, registered, configured, authorized, tested, deployed, verified, and linked to evidence. Claims that execution completed require proof, a receipt, and postcondition verification.

## Repository stability

Repository names, Fly applications, Docker images, Runtime endpoints, environment variables, and deployment artifacts retain their established names. Implementation files are renamed only when the consistency benefit is significant and risk is low. Avoid unnecessary Git churn.

Legacy layer names in existing APIs, database schemas, namespaces, persisted identifiers, or source files remain compatibility identifiers until a separately versioned migration is approved. Their presence does not make the historical layered model canonical.

## Change boundaries

Architectural terminology or documentation work does not authorize changes to runtime behavior, portal behavior, APIs, routing, authentication, authorization, deployment, tests, or execution.

## Future prompts and implementations

Every future Codex implementation prompt for a NEXUS repository must begin with:

> Follow the NEXUS Platform Constitution.

Future prompts reference this Constitution instead of redefining the architecture. Generated candidates remain non-authoritative until created, reviewed, tested or evaluated, approved, versioned, registered, deployed, and verified.
