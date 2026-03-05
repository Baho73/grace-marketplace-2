---
name: grace-generate
description: "Generate code for a specific GRACE module with full semantic markup. Use when a module has been planned and contracted in development-plan.xml and you need to generate the actual implementation code with MODULE_CONTRACT, MODULE_MAP, semantic blocks, and knowledge graph updates."
---

Generate code for the module specified by the user.

## Prerequisites
- `docs/development-plan.xml` must contain this module's contract
- `docs/knowledge-graph.xml` must have this module registered
- If either is missing, tell the user to run `$grace-plan` first

## Process

### Step 1: Load Context
Read from the knowledge graph:
1. The target module's entry in knowledge-graph.xml
2. All modules it depends on (follow CrossLinks)
3. The contracts of those dependency modules (read their MODULE_CONTRACT headers)

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
//   LAST_CHANGE: [v1.0.0 — Initial generation from development plan]
// END_CHANGE_SUMMARY

imports

// START_CONTRACT: ComponentOrFunction
//   PURPOSE: ...
//   INPUTS: ...
//   OUTPUTS: ...
// END_CONTRACT: ComponentOrFunction

code with START_BLOCK / END_BLOCK markers every ~500 tokens
```

Adapt comment syntax to the project language (e.g., `#` for Python, `//` for Go/TypeScript/Java).

### Step 3: Update Knowledge Graph
After generation, update knowledge-graph.xml:
- Add/verify the module entry with correct FILE path
- Add CrossLinks to all imported modules
- Add annotations for key methods

### Step 4: Verify
Run type checking or linting as appropriate for the project. Report results.

## Granularity Rules
- Blocks should be ~500 tokens (matching LLM sliding window)
- Every block name must be unique within the file
- Block names should describe WHAT the block does, not HOW
  - Good: `VALIDATE_USER_PERMISSIONS`, `FETCH_AND_CACHE_DATA`
  - Bad: `LOGIC_1`, `HELPER`, `MAIN_BLOCK`
