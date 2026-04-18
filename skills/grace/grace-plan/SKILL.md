---
name: grace-plan
description: "Run the GRACE architectural planning phase. Use when you have requirements and technology decisions defined and need to design the module architecture, create contracts, map data flows, and establish verification references. Produces development-plan.xml, verification-plan.xml, and knowledge-graph.xml."
---

Run the GRACE architectural planning phase.

## Prerequisites
- `docs/requirements.xml` must exist and have at least one UseCase
- `docs/technology.xml` must exist with stack decisions
- `docs/verification-plan.xml` should exist as the shared verification artifact template
- If requirements or technology are missing, tell the user to run `$grace-init` first
- If the verification plan template is missing, recreate it before finalizing the planning artifacts

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
- Annotations describe only the module's public interface
- Do not push private helpers or implementation-only types into shared XML artifacts

### Verification-Aware Planning
Planning is incomplete if modules cannot be verified.

For every significant module, define during planning:
- a `verification-ref` like `V-M-xxx`
- likely source and test file targets
- critical scenarios that must be checked
- the log or trace anchors needed to debug failures later
- which checks stay module-local versus wave-level or phase-level

### Phases With Checkpoints
Group modules into phases; close each phase with an explicit CHECKPOINT that enumerates the
conditions required to advance. A phase without a checkpoint is a pile of tasks.

A checkpoint lists:
- Which tests must pass (module-local, wave-level, phase-level)
- Which shared artifacts must be up to date (graph, plan, verification)
- Which cross-module flows must run end-to-end
- What to do if any check fails (which skill to invoke, how to rollback)

Checkpoints are not decoration — they are gates. The controller in `$grace-multiagent-execute`
reads them when deciding whether to advance waves.

### Dependency Discipline
Before adding a new module, new external dependency, or new cross-module CrossLink, run the
following discipline — record each answer in the plan's rationale block:

1. **Duplicate check** — does the existing graph already provide this capability? (`grace module find <query>`)
2. **Size estimate** — how many files / how much complexity? If the answer is "a lot", split now.
3. **Maintenance** — for external deps: is it actively maintained, what is the release cadence, who owns it upstream?
4. **License** — compatible with the project's license?
5. **Security** — known CVEs? (`npm audit` / ecosystem equivalent)
6. **Blast radius** — how many modules will import this? If many, consider whether it deserves its own module instead of inline use.

If the discipline surfaces a concern, write it as a `<risk>` entry in the plan. Do NOT silently
skip the check — the absence of a rationale block is itself a defect.

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
- Key public interfaces (what the module exposes to other modules or callers)
- Tentative source path, test path, and `verification-ref`

Present this to the user as a structured list and **wait for approval** before proceeding.

### Phase 3: Design Verification Surfaces
Before finalizing the plan, derive the first verification draft:
- map critical UseCases to `DF-xxx` data flows
- assign `V-M-xxx` verification entries for important modules
- list the most important success and failure scenarios
- identify required log markers or trace evidence for critical branches
- note module-local checks plus any wave-level or phase-level follow-up

Present this verification draft to the user as part of the same approval checkpoint. If the verification story is weak, revise the architecture before proceeding.

### Phase 4: Mental Walkthroughs
Run "mental tests" for 2-3 key user scenarios step by step:
- Which modules are involved?
- What data flows through them?
- Where could it break?
- Which logs or trace markers would prove the path was correct?
- Are there circular dependencies?

Present the walkthrough to the user. If issues are found — revise the architecture.

### Phase 5: Generate Artifacts
After user approval:

1. Update `docs/development-plan.xml` with the full module breakdown, public module contracts, target paths, observability notes, data flows, and implementation order. Use unique ID-based tags: `M-xxx` for modules, `Phase-N` for phases, `DF-xxx` for flows, `step-N` for steps, and `V-M-xxx` references for verification.
2. Update `docs/verification-plan.xml` with global verification policy, critical flows, module verification stubs, and phase gates.
3. Update `docs/knowledge-graph.xml` with all modules (as `M-xxx` tags), their public-interface annotations (as `fn-name`, `type-Name`, etc.), `verification-ref` links, and CrossLinks between them.
4. Print: "Architecture approved. Run `$grace-verification` to deepen tests and trace expectations, `$grace-execute` for sequential execution, or `$grace-multiagent-execute` for parallel-safe waves."

## Important
- Do NOT generate any code during this phase
- This phase produces ONLY planning documents and verification artifacts
- Every architectural decision must be explicitly approved by the user

## Output Format
Always produce:
1. Module breakdown table (ID, name, type, purpose, dependencies, target paths, verification ref)
2. Data flow diagrams (textual)
3. Verification surface overview (critical flows, module-local checks, log or trace anchors)
4. Implementation order grouped into **phases with checkpoints** (each phase ends with enumerated gate conditions)
5. Risk assessment (what could go wrong, including open dependency-discipline concerns)

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Architecture is obvious, skip the mental walkthrough" | Obvious to you may be wrong. The walkthrough IS the verification. Every skipped walkthrough is a bug you paid for later. |
| "We can refactor module boundaries later" | Boundaries are contracts. Refactoring them later breaks every dependent agent. Plan right the first time. |
| "Verification-ref can be added after we have tests" | Without V-M-xxx on the plan, execution will ship modules without verification entries. Plan the verification surface with the architecture. |
| "We do not need phases for a small project" | Even 5-module projects benefit from at least one checkpoint. Without it the 'done' signal is vibes. |
| "Adding a new dep is a one-liner, skip the discipline" | The discipline takes 2 minutes. Debugging a supply-chain mistake takes 2 weeks. |
| "Plan is just a draft, approval is a formality" | User approval is the only gate that separates GRACE from waterfall-with-extra-steps. Never skip it. |

## Red Flags

- You are writing code before user has approved the module breakdown.
- You added a new module without a V-M-xxx entry.
- You added a phase without a closing checkpoint.
- You added an external dependency without running the discipline.
- Your plan has no `<risk>` block — every non-trivial plan has risks worth naming.

## When NOT to Use

- A bug fix with clear root cause — use `$grace-fix` instead (no architectural change).
- A pure rename / move / split / merge — use `$grace-refactor`.
- Exploratory spike where contracts are intentionally informal — label the spike as non-GRACE and revisit plan when the spike concludes.
- The requirements are still in flux. Return to `$grace-init` to firm up `docs/requirements.xml` first.

## Verification

After running this skill:

- [ ] `docs/development-plan.xml` has at least one Phase-N with a checkpoint block (verification: grep for `<checkpoint`)
- [ ] Every module in the plan has a V-M-xxx reference (verification: no M-xxx lacks `verification-ref`)
- [ ] `docs/knowledge-graph.xml` lists every planned module with unique `M-xxx` tags (verification: `grace module find --path .` returns expected count)
- [ ] `docs/verification-plan.xml` has stub V-M-xxx entries for every module (verification: grep for each `V-M-xxx`)
- [ ] User has explicitly approved module breakdown and verification surface (verification: attach approval message)
- [ ] Dependency discipline rationale recorded for every new external dep (verification: each new dep has its own `<rationale>` block)
