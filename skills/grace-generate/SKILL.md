---
name: grace-generate
description: "Generate code for a specific GRACE module with full semantic markup. Use when a module has been planned and contracted in development-plan.xml and you need to generate the implementation code plus either direct graph updates or controller-friendly graph deltas."
---

Generate code for the module specified by the user.

## Prerequisites
- `docs/development-plan.xml` must contain this module's contract
- `docs/knowledge-graph.xml` must have this module registered
- If either is missing, tell the user to run `$grace-plan` first

## Process

### Step 1: Load Context
Use the smallest complete context that still preserves contract fidelity.

1. In standalone generation, read:
   - the target module's entry in `docs/knowledge-graph.xml`
   - all modules it depends on
   - the contracts of those dependency modules
2. In controller-driven multi-agent generation, treat the controller's execution packet as the primary source of truth
3. If the packet already contains the module contract, graph entry, dependency summaries, write scope, and verification command, do not reread the whole plan and graph again
4. Read extra local files only when needed to implement the assigned module correctly

### Step 2: Generate with GRACE Markup
Generate the code file following this exact structure:

```
// FILE: path
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: from development-plan.xml
//   SCOPE: from development-plan.xml
//   DEPENDS: list
//   LINKS: knowledge graph references
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   list all exports with one-line descriptions
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial generation from development plan]
// END_CHANGE_SUMMARY

imports

// START_CONTRACT: ComponentOrFunction
//   PURPOSE: ...
//   INPUTS: ...
//   OUTPUTS: ...
// END_CONTRACT: ComponentOrFunction

code with START_BLOCK / END_BLOCK markers every ~500 tokens
```

Adapt comment syntax to the project language (for example `#` for Python, `//` for Go, TypeScript, or Java).

### Step 3: Produce Graph Sync Output
Handle graph synchronization differently depending on who owns shared artifacts.

- **Standalone mode**: update `docs/knowledge-graph.xml` directly
- **Controller-driven multi-agent mode**: do not edit shared XML directly; return a graph delta proposal containing:
  - module ID and file path
  - actual imports and implied CrossLinks
  - exports and annotations
  - any dependency mismatch between contract and implementation

### Step 4: Verify
Run verification at module scope unless the caller explicitly asks for more.

- Run type checking, linting, and module-local tests as appropriate
- Prefer deterministic local assertions over broad end-to-end checks at this stage
- Leave wave-level integration checks and full-suite runs to the controller in multi-agent execution

### Step 5: Report
Return a concise implementation packet containing:

1. files changed
2. module-local verification results
3. graph sync output or graph delta proposal
4. open assumptions or integration risks

## Granularity Rules
- Blocks should be ~500 tokens (matching LLM sliding window)
- Every block name must be unique within the file
- Block names should describe WHAT the block does, not HOW
  - Good: `VALIDATE_USER_PERMISSIONS`, `FETCH_AND_CACHE_DATA`
  - Bad: `LOGIC_1`, `HELPER`, `MAIN_BLOCK`
- Do not broaden the write scope beyond the assigned module unless the controller or user explicitly revises the plan
