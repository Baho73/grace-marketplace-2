# Semantic Markup Convention

Semantic markup in GRACE serves dual purpose: **navigation anchors** for RAG agents and **attention anchors** for LLM context management. Markers are NOT comments — they are load-bearing structure.

## Module Level (top of each file)

Every source file must begin with:

```
// FILE: path/to/file.ext
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: [What this module does — one sentence]
//   SCOPE: [What operations are included]
//   DEPENDS: [List of module dependencies]
//   LINKS: [References to knowledge graph nodes]
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ComponentName — [one-line description]
//   useHookName — [one-line description]
//   utilityFunction — [one-line description]
// END_MODULE_MAP
```

Adapt comment syntax to the project language (`#` for Python, `//` for Go/TS/Java, `--` for SQL).

## Function/Component Level

Every exported function or component must have a contract:

```
// START_CONTRACT: functionName
//   PURPOSE: [What it does]
//   INPUTS: { paramName: Type — description }
//   OUTPUTS: { ReturnType — description }
//   SIDE_EFFECTS: [What external state it modifies]
//   LINKS: [Related modules/functions via knowledge graph]
// END_CONTRACT: functionName
```

## Code Block Level (inside functions)

```
// START_BLOCK_VALIDATE_INPUT
// ... code ...
// END_BLOCK_VALIDATE_INPUT

// START_BLOCK_TRANSFORM_DATA
// ... code ...
// END_BLOCK_TRANSFORM_DATA
```

## Change Tracking

```
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 — What changed and why]
// END_CHANGE_SUMMARY
```

## Granularity Rules

1. **~500 tokens per block** — this matches the LLM sliding window for optimal attention. Too large = LLM loses track. Too small = noise.
2. **Unique block names** — never use generic names like `LOGIC_1`, `HELPER`, `MAIN_BLOCK`. Use descriptive names: `VALIDATE_USER_PERMISSIONS`, `FETCH_AND_CACHE_DATA`.
3. **Paired markers** — every `START_BLOCK_X` MUST have a matching `END_BLOCK_X`. Unpaired markers are integrity violations.
4. **Block names describe WHAT, not HOW** — the name should tell you the block's purpose without reading the code.

## Logging Convention

All logs must reference semantic blocks for traceability:
```
logger.info(`[ModuleName][functionName][BLOCK_NAME] message`);
```

This creates a direct link from runtime logs to source code blocks.

## Rules

1. Never remove semantic markup anchors — they are load-bearing structure
2. When editing code, preserve block boundaries unless the edit requires restructuring
3. If a block grows beyond ~500 tokens, split it into sub-blocks
4. If you rename a block, update all log references
5. MODULE_MAP must always reflect the current exports of the file
