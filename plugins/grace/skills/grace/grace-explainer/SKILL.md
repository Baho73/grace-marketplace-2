---
name: grace-explainer
description: "Полный справочник по методологии GRACE. Использовать при объяснении GRACE пользователям, онбординге новых проектов или когда нужно самому разобраться во фреймворке — принципах, семантической разметке, графах знаний, контрактах, тестировании и конвенциях уникальных тегов."
---

# GRACE — Graph-RAG Anchored Code Engineering

GRACE is a methodology for AI-driven code generation that makes codebases **navigable by LLMs**. It solves the core problem of AI coding assistants: they generate code but can't reliably navigate, maintain, or evolve it across sessions.

## The Problem GRACE Solves

LLMs lose context between sessions. Without structure:
- They don't know what modules exist or how they connect
- They generate code that duplicates or contradicts existing code
- They can't trace bugs through the codebase
- They drift from the original architecture over time

GRACE provides four interlocking systems that fix this:

```
Knowledge Graph (docs/knowledge-graph.xml)
    maps modules, dependencies, and public module interfaces
Module Contracts (MODULE_CONTRACT in each file)
    defines WHAT each module does
Semantic Markup (START_BLOCK / END_BLOCK in code)
    makes code navigable at ~500 token granularity
Verification Plan (docs/verification-plan.xml)
    defines HOW correctness, traces, and logs are proven
Operational Packets (docs/operational-packets.xml)
    standardizes execution packets, deltas, and failure handoff
```

## Six Core Principles

### 1. Never Write Code Without a Contract
Before generating any module, create its MODULE_CONTRACT with PURPOSE, SCOPE, INPUTS, OUTPUTS. The contract is the source of truth — code implements the contract, not the other way around.

### 2. Semantic Markup Is Not Comments
Markers like `// START_BLOCK_NAME` and `// END_BLOCK_NAME` are **navigation anchors**, not documentation. They serve as attention anchors for LLM context management and retrieval points for RAG systems.

### 3. Knowledge Graph Is Always Current
`docs/knowledge-graph.xml` is the single map of the entire project. When you add a module — add it to the graph. When you add a dependency — add a CrossLink. The graph never drifts from reality. Shared docs should describe the module's public contract, not every private helper or implementation detail.

### 4. Top-Down Synthesis
Code generation follows a strict pipeline:
```
Requirements -> Technology -> Development Plan -> Verification Plan -> Module Contracts -> Code + Tests
```
Never jump to code. If requirements are unclear — stop and clarify.

### 5. Verification Is Architecture
Testing, traces, and log markers are not cleanup work. They are part of the architectural blueprint. If another agent cannot verify or debug a module from the evidence left behind, the module is not fully done.

### 6. Governed Autonomy (PCAM)
- **Purpose**: defined by the contract (WHAT to build)
- **Constraints**: defined by the development plan (BOUNDARIES)
- **Autonomy**: you choose HOW to implement
- **Metrics**: the contract plus verification evidence tell you if you're done

You have freedom in HOW, not in WHAT. If a contract seems wrong — propose a change, don't silently deviate.

## How the Elements Connect

```
docs/requirements.xml          — WHAT the user needs (use cases, AAG notation)
        |
docs/technology.xml            — WHAT tools we use (runtime, language, versions)
        |
docs/development-plan.xml      — HOW we structure it (modules, phases, public contracts)
        |
docs/verification-plan.xml     — HOW we prove it works (tests, traces, log markers)
docs/operational-packets.xml   — HOW agents hand work across execution, review, and fixes
        |
docs/knowledge-graph.xml       — MAP of module boundaries, dependencies, public interfaces, and verification refs
        |
src/**/* + tests/**/*          — CODE and TESTS with GRACE markup and evidence hooks
```

Each layer feeds the next. The knowledge graph and verification plan are both outputs of planning and inputs for execution.

Important boundary rule:
- shared GRACE docs describe only public module contracts and public module interfaces
- private helpers, local-only types, and internal orchestration details stay in the module file header, function contracts, and semantic blocks

## Optional CLI Support

GRACE also has an optional CLI package, `@osovv/grace-cli`, which installs the `grace` binary.

Current public commands:
- `grace lint --path /path/to/project`
- `grace module find auth --path /path/to/project`
- `grace module show M-AUTH --path /path/to/project --with verification`
- `grace file show src/auth/index.ts --path /path/to/project --contracts --blocks`

Use the CLI for:
- GRACE semantic markup pairing and completeness
- unique-tag convention anti-patterns in XML
- graph/plan/verification reference mismatches
- MODULE_MAP vs export drift in supported source files
- resolving module IDs from names, paths, dependencies, and verification refs
- reading shared/public module context from the XML artifacts
- reading file-local/private implementation context from governed source files

Public/private split:
- `grace module show` is the shared/public view of a module from plan, graph, steps, and verification
- `grace file show` is the file-local/private view from `MODULE_CONTRACT`, `MODULE_MAP`, `CHANGE_SUMMARY`, scoped contracts, and semantic blocks
- `grace module find` searches both planes, including `LINKS` from file-local markup

The CLI does not replace `$grace-reviewer`, `$grace-refresh`, or `$grace-verification`. It is a cheap automated guardrail before or alongside those higher-context workflows.

## Development Workflow

1. `$grace-init` — create docs/ structure and AGENTS.md
2. Fill in `requirements.xml` with use cases
3. Fill in `technology.xml` with stack decisions
4. `$grace-plan` — architect modules, data flows, and verification refs
5. `$grace-verification` — design and maintain tests, traces, and log-driven evidence
6. `$grace-execute` — generate all modules sequentially with review and commits
7. `$grace-multiagent-execute` — generate parallel-safe modules in controller-managed waves
8. `$grace-refactor` — rename, move, split, merge, or extract modules without drift
9. `$grace-refresh` — sync graph and verification refs after manual changes
10. `$grace-fix error-description` — debug via semantic navigation
11. `$grace-status` — health report
12. `$grace-ask` — grounded Q&A over the project artifacts

## Detailed References

For in-depth documentation on each GRACE component, see the reference files in this skill's `references/` directory:

- `references/semantic-markup.md` — Block conventions, granularity rules, logging
- `references/knowledge-graph.md` — Graph structure, module types, CrossLinks, maintenance
- `references/contract-driven-dev.md` — MODULE_CONTRACT, function contracts, PCAM
- `references/verification-driven-dev.md` — Verification plans, test design, traces, and log-driven development
- `references/unique-tag-convention.md` — Unique ID-based XML tags, why they work, full naming table

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know GRACE from previous sessions, I can answer without reading this SKILL.md" | GRACE evolves — the Six Core Principles, the five-artifact diagram (adding `operational-packets.xml`), and the public/private boundary rule all change between releases. Answer from the current SKILL.md and the `references/` files, not memory. |
| "I'll summarize the methodology in my own words, faster than quoting" | Paraphrased GRACE loses load-bearing terms: "MODULE_CONTRACT" vs. "module spec," "CrossLink" vs. "dependency edge," "V-M-xxx" vs. "test ID." The user then asks a follow-up using the paraphrase and nothing in `docs/*.xml` matches. Quote the canonical terms. |
| "The user asked a simple question, I don't need to cite a reference file path" | This skill IS the reference. Every claim should point to either a section in this SKILL.md or a specific file in `references/` (e.g. `references/semantic-markup.md`). No path = no grounding, and the user cannot verify or deep-dive. |
| "Semantic markup is basically comments with a naming convention" | Explicit in Core Principle 2: "Semantic Markup Is Not Comments." They are navigation anchors for LLM context management and RAG retrieval points — calling them comments misleads the user about what they do and when to add them. |
| "Shared docs should describe every helper for completeness" | Explicit boundary rule: "shared GRACE docs describe only public module contracts and public module interfaces; private helpers, local-only types, and internal orchestration details stay in the module file header." Over-sharing violates the public/private split and causes graph bloat. |
| "`grace` CLI replaces `$grace-reviewer` / `$grace-refresh` / `$grace-verification`" | Explicit in the Optional CLI Support section: "The CLI does not replace `$grace-reviewer`, `$grace-refresh`, or `$grace-verification`. It is a cheap automated guardrail before or alongside those higher-context workflows." Do not describe it as a substitute. |
| "Contracts are documentation, code is the real artifact" | Core Principle 1 inverts this: "code implements the contract, not the other way around." Describing contracts as documentation leads users to write code first and back-fill contracts, which is the exact drift GRACE exists to prevent. |
| "I'll skip explaining PCAM, it's just jargon" | PCAM (Purpose / Constraints / Autonomy / Metrics) is Core Principle 6 — it is how governed autonomy is defined. Skipping it means the user thinks they have freedom in WHAT, when the rule is freedom in HOW only. |

## Red Flags

- You answered a GRACE question without re-reading this SKILL.md or the relevant `references/*.md` file in the current session.
- You described semantic markup as "comments," "annotations," or "documentation" instead of navigation anchors.
- You listed the GRACE artifacts without mentioning the shared-docs-public-only boundary rule, or you included `operational-packets.xml` in one place and omitted it in another.
- You named a skill as `grace-ask` or `/grace-ask` while the canonical developer-workflow list uses `$grace-ask`.
- Your explanation of the workflow omitted `$grace-verification` between `$grace-plan` and `$grace-execute`, or omitted `$grace-multiagent-execute`.
- You cited a fact with no path to a reference file or a section of this SKILL.md.
- You described the `grace` CLI as a replacement for `$grace-reviewer`, `$grace-refresh`, or `$grace-verification`.
- You mixed up the public/private split: attributing MODULE_MAP or CHANGE_SUMMARY to shared docs, or attributing CrossLinks to the file-local plane.

## When NOT to Use

- The user wants to execute, plan, fix, refactor, review, or refresh an actual GRACE project — route to the specific `$grace-*` skill; this skill is reference material, not an action skill.
- The user wants project-specific answers grounded in their `docs/*.xml` — use `$grace-ask`, which loads artifacts and cites them; `$grace-explainer` describes the methodology, not the project.
- The user needs machine-readable lint output or module navigation — use `$grace-cli`.
- The user's codebase is not (and will not be) a GRACE project — explaining GRACE as prescription rather than context misleads; answer the underlying question in their stack's terms instead.
- The user asked "what should I do next in my project" — that is `$grace-status` or `$grace-ask`, not an explainer answer.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Every claim in the answer maps to a section in this SKILL.md or a specific file under `skills/grace/grace-explainer/references/` (verification: each assertion is followed by a path or section heading)
- [ ] The Six Core Principles were named by their canonical names when the answer covered principles (verification: `grep -E "Never Write Code Without a Contract|Semantic Markup Is Not Comments|Knowledge Graph Is Always Current|Top-Down Synthesis|Verification Is Architecture|Governed Autonomy" <answer>`)
- [ ] The artifact list, when mentioned, included all five: `development-plan.xml`, `verification-plan.xml`, `knowledge-graph.xml`, `operational-packets.xml`, plus the MODULE_CONTRACT / markup layer (verification: grep the answer for each filename)
- [ ] The public/private split was stated correctly: `grace module show` = shared/public, `grace file show` = file-local/private (verification: cite the "Public/private split" section)
- [ ] Skill references used the `$grace-*` form as in the Development Workflow list (verification: `grep -E "\\$grace-(init|plan|verification|execute|multiagent-execute|refactor|refresh|fix|status|ask)" <answer>`)
- [ ] The optional `grace` CLI was described as a guardrail, not a replacement for `$grace-reviewer` / `$grace-refresh` / `$grace-verification` (verification: grep for the exact phrase "does not replace" or an equivalent disclaimer)
- [ ] Any deep-dive question was routed to the correct `references/*.md` file by name (verification: `ls skills/grace/grace-explainer/references/` matches the files cited)
