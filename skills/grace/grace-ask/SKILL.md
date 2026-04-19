---
name: grace-ask
description: "Ответ на вопрос о GRACE-проекте с прогрессивным раскрытием контекста. Использовать, когда у пользователя есть вопрос о кодовой базе, архитектуре, модулях или реализации — начинает с самого дешёвого уровня контекста, углубляется ТОЛЬКО при необходимости и даёт обоснованный ответ со ссылками на источники."
---

Answer a question about the current GRACE project using the **smallest context that still answers
correctly**. Naïve loading of every XML artifact and every governed file wastes tokens and buries
the answer in noise.

## Context Hierarchy (Progressive Disclosure)

Load context in escalating levels. Announce the level you are loading in one line in your working
notes: `"Loading Level 2 context: docs/development-plan.xml scope = Phase-1"`. Do not silently
escalate.

### Level 1 — ALWAYS (cheap, fixed cost)
Every `grace-ask` invocation loads exactly this set:

- `AGENTS.md` — conventions, keywords, stack
- `CLAUDE.md` — project-specific activation rules
- `grace status --path . --brief` output (if the CLI is installed) — single-screen health snapshot

This is enough to:
- route the question to the right module family
- identify the stack and its constraints
- know whether the project is in a clean or drift state

### Level 2 — PER-FEATURE (load only the relevant slice)
Load only when Level 1 does not answer the question.

- Relevant section of `docs/development-plan.xml` (one phase, one module, one dataflow)
- Relevant section of `docs/knowledge-graph.xml` (one `M-xxx` plus its direct CrossLinks)
- `grace module show M-XXX --path . --with verification` (if CLI available)

Rule: scope by name. If the question is about M-AUTH, load only M-AUTH plus its one-hop neighbors.
Do NOT load the whole graph.

### Level 3 — PER-TASK (deep dive on a specific code path)
Load only when Level 2 does not answer the question.

- Governed file(s) for the module under discussion
- Specific `START_BLOCK_*` / `END_BLOCK_*` ranges, not the whole file
- Matching V-M-xxx entry in `docs/verification-plan.xml`
- Tests and log markers attached to the block in question
- `grace file show <path> --path . --contracts --blocks` (if CLI available)

Rule: read blocks, not whole files. If a function's CONTRACT is enough, do NOT read its implementation.

### Level 4 — ON DEMAND (expensive, avoid)
Load only when Level 3 is insufficient.

- Full `docs/verification-plan.xml`
- `docs/operational-packets.xml` (canonical packet, delta, failure-handoff shapes)
- `docs/requirements.xml` (use cases, requirements)
- `docs/technology.xml` (stack, tooling, observability)
- Full repository scan (`grace lint --path .` for structural anomalies)

Rule: Level 4 is for cross-cutting or methodology questions ("how is verification organized across
the project?"), not for specific-module questions.

## Process

### Step 1: Load Level 1
Read `AGENTS.md` and `CLAUDE.md`. If `grace` CLI is installed, run `grace status --brief`. Announce:
`"Level 1 loaded."`

### Step 2: Decide if Level 1 Is Enough
If the answer is about conventions, stack, or project health — stop here. Answer and cite the
Level 1 sources.

If the answer requires specific modules or behavior — escalate to Level 2.

### Step 3: Load Level 2 (Scoped)
Identify the smallest set of modules that could contain the answer. Use
`grace module find <query>` if available — it is cheaper than reading the XML by hand. Pull the
relevant `M-xxx` entries from the graph and plan, plus their direct CrossLinks.

Announce: `"Level 2 loaded: M-XXX, M-YYY."`

### Step 4: Decide if Level 2 Is Enough
If the answer is about architecture, contracts, or dependencies — stop here. Answer and cite the
Level 1–2 sources.

If the answer requires specific implementation behavior — escalate to Level 3.

### Step 5: Load Level 3 (Block-Scoped)
For each governed file in scope:
- Read the MODULE_CONTRACT and MODULE_MAP (header of the file)
- Jump to the relevant `START_BLOCK_*` and read ONLY that block plus the function CONTRACT that contains it
- Read the matching V-M-xxx entry

Announce: `"Level 3 loaded: path/to/file.ts::BLOCK_NAME, V-M-XXX."`

### Step 6: Decide if Level 3 Is Enough
Most implementation questions stop here. Escalate to Level 4 ONLY for cross-cutting or methodology
questions.

### Step 7: Level 4 (Only If Justified)
Load additional artifacts only when Level 3 cannot answer. Explicitly state why: `"Escalating to
Level 4 because the question spans verification policy across all modules."`

### Step 8: Answer
Provide a clear, concise answer grounded in the actual project artifacts. Cite which files /
modules / blocks your answer is based on using `path:line` references. Close with the context
level at which you stopped: `"Answered at Level 2."`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Load everything to be safe" | Loading everything buries the signal. Scope to the smallest answer-bearing slice. |
| "Level 1 is too little, skip to Level 3" | Often Level 1 is enough — you learn by trying. Skipping hides the efficient path. |
| "Announcing the level is bureaucratic" | The announcement is a cost-tracking signal. It tells the user (and future-you) why the token bill was X. |
| "One file read is cheap, skip the block scoping" | On a multi-thousand-line file, reading the block is 10x cheaper than reading the file. Do it. |
| "CLI is optional, read the XML by hand" | The CLI is 10-100x cheaper for scoped queries. Use it when available. |
| "Cite generically: 'per the plan'" | Specific citations (`development-plan.xml#M-AUTH`) are verifiable. Generic citations rot. |

## Red Flags

- You loaded Level 4 without having exhausted Levels 1–3 first.
- You read a full governed file without scoping to the relevant block.
- Your answer has no citations.
- Your answer relies on "I remember" instead of artifact evidence.
- You loaded the whole knowledge graph to answer a single-module question.

## When NOT to Use

- The user wants to MODIFY code — route to `$grace-fix`, `$grace-refactor`, or `$grace-execute`.
- The user is asking a GRACE-methodology question ("how does PCAM work?") — route to `$grace-explainer`.
- The project is not GRACE-managed yet — the artifacts do not exist.
- You already have a complete answer from a previous turn in this session and the project has not changed.

## Important

- Never guess — if the information is not in the project artifacts, say so.
- If the question reveals a gap in documentation or contracts, mention it as a follow-up.
- If the question reveals a gap in tests, traces, or verification docs, mention it as a follow-up.
- If the answer requires changes to the project, suggest the appropriate `$grace-*` skill.

## Verification

Before finalizing the answer, confirm:

- [ ] The highest context level loaded is announced (verification: the reply contains `"Answered at Level N"`)
- [ ] Every fact in the answer cites a specific `path` or `M-xxx` (verification: no bare claims)
- [ ] You did not escalate past the level actually needed (verification: check that each higher level was justified in one sentence)
- [ ] If information was missing from artifacts, the gap is named as a follow-up
