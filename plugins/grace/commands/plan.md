Run the GRACE architectural planning phase.

## Prerequisites
- `docs/requirements.xml` must exist and have at least one UseCase
- `docs/technology.xml` must exist with stack decisions
- If either is missing, tell the user to run `/grace:init` first

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

Present the walkthrough to the user. If issues are found — revise the architecture.

### Phase 4: Generate Artifacts
After user approval:

1. Update `docs/development-plan.xml` with the full module breakdown, contracts, and data flows. Use unique ID-based tags: `<M-xxx>` for modules, `<Phase-N>` for phases, `<DF-xxx>` for flows, `<step-N>` for steps, `<export-name>` for interface entries. See CLAUDE.md "Documentation Artifacts" for full convention.
2. Update `docs/knowledge-graph.xml` with all modules (as `<M-xxx>` tags), their annotations (as `<fn-name>`, `<type-Name>`, etc.), and CrossLinks between them.
3. Print: "Architecture approved. Run `/grace:generate <module-name>` to start generating code, or `/grace:execute` to generate all modules sequentially."

## Important
- Do NOT generate any code during this phase
- This phase produces ONLY planning documents
- Every architectural decision must be explicitly approved by the user
