---
name: grace-refactor
description: "Refactor GRACE-governed code safely: rename, move, split, merge, or extract modules while keeping contracts, graph, verification, and semantic markup synchronized."
---

Refactor a GRACE project without letting architecture or verification drift.

## When to Use
- rename a module, file, symbol, or path
- split one module into multiple modules
- merge tightly coupled modules
- extract helpers or adapters into a new module
- move code across layers while preserving behavior
- tighten an interface or dependency surface with explicit approval

Do not use this skill for greenfield implementation. Use `$grace-plan`, `$grace-execute`, or `$grace-multiagent-execute` for new work.

## Prerequisites
- `docs/development-plan.xml` must exist
- `docs/knowledge-graph.xml` must exist
- `docs/verification-plan.xml` should exist
- if the refactor introduces new modules, removes modules, or changes contract behavior, stop and get explicit user approval before editing code
- if `docs/operational-packets.xml` exists, use its canonical packet and delta shapes

## Core Principle

A GRACE refactor is not just a code move.

It is an atomic migration across:
- source files
- test files
- semantic markup
- `docs/development-plan.xml`
- `docs/knowledge-graph.xml`
- `docs/verification-plan.xml`

The refactor is not done until all six agree again.

## Process

### Step 1: Classify the Refactor
Identify the exact refactor type:
- `rename`
- `move`
- `split`
- `merge`
- `extract`
- `interface-tighten`
- `path-only`

For the requested change, capture:
- source module IDs and file paths
- target module IDs and file paths
- behavior that must remain invariant
- approved contract changes, if any
- likely graph and verification fallout

If the change affects behavior, public contracts, or architecture boundaries, present the planned deltas and wait for approval.

### Step 2: Build a Refactor Packet
Before editing, prepare a controller-owned packet containing:
- refactor kind
- source scope
- target scope
- approved write scope
- invariants to preserve
- contract delta summary
- graph delta summary
- verification delta summary
- required local, integration, and follow-up checks

When `docs/operational-packets.xml` exists, align the packet, graph delta, verification delta, and failure handoff to those canonical templates.

### Step 3: Apply the Smallest Safe Refactor
Work in the safest order for the refactor type.

Always:
- preserve or intentionally update MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY, function contracts, and semantic blocks
- keep imports aligned with approved dependencies
- preserve or update stable `[Module][function][BLOCK_NAME]` markers when critical branches move
- move module-local tests with the behavior they verify
- prefer atomic renames over long-lived mixed states

For `split` and `merge` refactors:
- keep ownership explicit for each resulting module
- update write scopes and test scopes accordingly
- do not leave half-migrated logic spread across modules silently

Shared-doc rule:
- keep shared docs focused on public module contracts and public interfaces
- let private helper reshaping stay local unless it changes the public boundary

### Step 4: Synchronize Shared Artifacts
After the code refactor, update the shared artifacts in one coherent pass.

Update `docs/development-plan.xml` for:
- module IDs and names
- target source/test paths
- implementation order or ownership changes
- verification references

Update `docs/knowledge-graph.xml` for:
- module tags
- public annotations and public exports only
- CrossLinks
- verification refs

Update `docs/verification-plan.xml` for:
- `V-M-xxx` entries
- test file paths
- module-local commands
- required markers and trace assertions
- wave-level or phase-level follow-up checks

If IDs changed, update every reference atomically. Do not leave temporary stale IDs unless the user explicitly requires compatibility handling.

### Step 5: Verify by Blast Radius
Run verification at the smallest level that still protects correctness:
- renamed or moved module-local checks first
- affected integration surfaces second
- broader phase checks when coupling changed materially

If the refactor causes failures, produce a structured failure handoff using the canonical `FailurePacket` shape when available.

### Step 6: Review and Refresh
Before declaring success:
- run a scoped `$grace-reviewer` pass on the changed files and shared-artifact deltas
- run targeted `$grace-refresh` on the touched modules and dependency surfaces
- escalate to a full refresh or broader review if the refactor reveals wider drift

## Rules
- Never silently invent new architecture during a refactor
- Never leave code and shared artifacts in different realities
- Prefer smaller, narratable migrations over giant rewrites
- Keep compatibility shims only when there is a concrete requirement
- If the refactor reveals weak tests or weak logs, strengthen verification before calling it complete

## Deliverables
1. refactor kind and affected scope
2. files changed
3. graph delta proposal
4. verification delta proposal
5. verification evidence
6. remaining risks or follow-up checks

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It is just a rename, I can update `docs/knowledge-graph.xml` later" | A renamed module ID with stale CrossLinks means every consumer is pointing at a ghost. Every `M-xxx` reference must be updated in the same commit or the graph is already lying. |
| "Split is clean — the two halves share one module record for now" | Shared ownership is the bug you are creating. Each resulting module needs its own MODULE_CONTRACT, its own write scope in the packet, and its own `V-M-xxx` entry. Anything else is a merge conflict waiting inside the graph. |
| "The old semantic blocks still work after the move — I will leave them" | `START_BLOCK_*` names attached to a different file mislead every future navigator and break log markers like `[Module][function][BLOCK_NAME]`. Either delete or rename them in the moved file. |
| "Merging these two modules does not need a contract change — scopes just union" | Union-of-scopes is how architectural boundaries silently erode. Write the combined MODULE_CONTRACT.SCOPE deliberately and get approval before the merge edit lands. |
| "path-only change does not need a graph update" | `docs/knowledge-graph.xml` stores file paths and verification refs. A silent path change breaks `grace module show M-xxx` lookups and `V-M-xxx` test-file fields. |
| "Extract is low-risk, I will not touch `docs/verification-plan.xml`" | The extracted helper inherits none of the parent's verification evidence. Either attach new `V-M-xxx` coverage to the extracted module or document why it is intentionally untested. |

## Red Flags

- You moved or renamed a file but `docs/knowledge-graph.xml` still contains the old path or old `M-xxx` id.
- A `split` or `merge` commit leaves two modules claiming ownership of the same function or file.
- You edited imports to match the new module layout but did not re-run the module-local verification suite.
- CrossLinks in the graph reference a module id that `grace module show M-xxx` can no longer resolve.
- The refactor introduced a new module and you have not added the matching `V-M-xxx` block to `docs/verification-plan.xml`.
- Old `START_BLOCK_*` / `END_BLOCK_*` markers or `[Module][function][BLOCK_NAME]` log anchors remain pointing at code that no longer exists.
- You are about to commit without running a scoped `$grace-reviewer` pass on the changed files and shared-artifact deltas.

## When NOT to Use

- A bug fix is the real goal — use `$grace-fix` so the Prove-It cycle is honored instead of smuggling a fix inside a refactor.
- The work requires designing new architecture or new modules — use `$grace-plan` first, then `$grace-execute` for the implementation.
- The change is a pure formatting / whitespace / comment-typo edit that does not touch contracts, paths, or module boundaries — standard tooling is enough; the shared artifacts have nothing to learn from it.
- You have no approval for a contract change but the refactor would force one — stop and return to the user with the delta before touching code.
- The project has no `docs/knowledge-graph.xml` or `docs/development-plan.xml` yet — run `$grace-init` and `$grace-plan` first; there is nothing to keep in sync.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Every touched module id resolves with `grace module find <new-path>` and `grace module show M-xxx --path . --with verification` returns a non-empty contract.
- [ ] `bun run grace lint --path . --allow-missing-docs` reports no drift on semantic markup, graph, or verification plan.
- [ ] `grep -rn "START_BLOCK_" <old-path>` returns nothing after a `move` or `rename` (the old location must be free of orphan markers).
- [ ] `grep -n "<old-module-id>" docs/` returns zero hits after a rename — no stale `M-xxx` references in graph or plan.
- [ ] Module-local verification command from `docs/verification-plan.xml` for each changed module exits 0 (attach command + result).
- [ ] For `split` / `merge`: each resulting module has its own `MODULE_CONTRACT` block (verification: `grep -n "MODULE_CONTRACT" <new-file>` for every new module id).
- [ ] `docs/development-plan.xml` step status and file paths reflect the new layout (verification: `grep -n "<new-path>" docs/development-plan.xml`).
- [ ] A scoped `$grace-reviewer` pass over the refactor diff returns APPROVE with no Critical findings on axes 1, 3, and 5.
