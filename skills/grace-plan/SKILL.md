---
name: grace-plan
description: "Run the GRACE architectural planning phase. Use when you have requirements and technology decisions defined and need to design the module architecture, create contracts, and build the knowledge graph. Produces development-plan.xml and knowledge-graph.xml."
---

Run the GRACE architectural planning phase.

## Prerequisites
- `docs/requirements.xml` must exist and have at least one UseCase
- `docs/technology.xml` must exist with stack decisions
- If either is missing, tell the user to run `$grace-init` first

## Architectural Principles

When designing the architecture, apply these principles:

### Contract-First Design
Every module gets a MODULE_CONTRACT before any code is written:
- PURPOSE: one sentence, what it does
- SCOPE: what operations are included
- DEPENDS: list of module dependencies
- LINKS: knowledge graph node references

### Module Taxonomy
Classify each module as one of:
- **ENTRY_POINT** — where execution begins (CLI, HTTP handler, event listener)
- **CORE_LOGIC** — business rules and domain logic
- **DATA_LAYER** — persistence, queries, caching
- **UI_COMPONENT** — user interface elements
- **UTILITY** — shared helpers, configuration, logging
- **INTEGRATION** — external service adapters

### Knowledge Graph Design
Structure `docs/knowledge-graph.xml` for maximum navigability:
- Each module gets a unique ID tag: `M-xxx NAME="..." TYPE="..."`
- Functions annotated as `fn-name`, types as `type-Name`
- CrossLinks connect dependent modules bidirectionally
- Annotations describe what each module exports

## Process

### Phase 1: Analyze Requirements
Read `docs/requirements.xml`. For each UseCase, identify:
- What modules/components are needed
- What data flows between them
- What external services or APIs are involved

### Phase 2: Design Module Architecture
Propose a module breakdown. For each module, define:
- Purpose (one sentence)
- Type: ENTRY_POINT / CORE_LOGIC / DATA_LAYER / UI_COMPONENT / UTILITY / INTEGRATION
- Dependencies on other modules
- Key interfaces (what it exposes)

Present this to the user as a structured list and **wait for approval** before proceeding.

### Phase 3: Mental Tests
Before finalizing, run "mental tests" — walk through 2-3 key user scenarios step by step:
- Which modules are involved?
- What data flows through them?
- Where could it break?
- Are there circular dependencies?

Present the walkthrough to the user. If issues are found — revise the architecture.

### Phase 4: Generate Artifacts
After user approval:

1. Update `docs/development-plan.xml` with the full module breakdown, contracts, and data flows. Use unique ID-based tags: `M-xxx` for modules, `Phase-N` for phases, `DF-xxx` for flows, `step-N` for steps, `export-name` for interface entries. See AGENTS.md "Documentation Artifacts" for full convention.
2. Update `docs/knowledge-graph.xml` with all modules (as `M-xxx` tags), their annotations (as `fn-name`, `type-Name`, etc.), and CrossLinks between them.
3. Print: "Architecture approved. Run `$grace-generate module-name` to start generating code, or `$grace-execute` to generate all modules sequentially."

## Important
- Do NOT generate any code during this phase
- This phase produces ONLY planning documents
- Every architectural decision must be explicitly approved by the user

## Output Format
Always produce:
1. Module breakdown table (ID, name, type, purpose, dependencies)
2. Data flow diagrams (textual)
3. Implementation order (phased, with dependency justification)
4. Risk assessment (what could go wrong)
