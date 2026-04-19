---
name: grace-refresh
description: "Синхронизация общих GRACE-артефактов с актуальной кодовой базой. Использовать точечный refresh после контролируемых волн или полный refresh после рефакторингов и когда есть подозрение на расхождение между графом, планом верификации и кодом."
---

Synchronize the GRACE shared artifacts with the actual codebase.

## Refresh Modes

Default to the narrowest scope that can still answer the drift question.

### `targeted` (default during active execution)
- scan only changed modules, touched imports, and directly affected dependency surfaces
- use when a controller already has wave results or graph delta proposals
- ideal after a clean multi-agent wave

### `full`
- scan the whole source tree
- use after refactors, manual edits across many modules, phase completion, or when targeted refresh finds suspicious drift

## Process

### Step 1: Choose Scope
Decide whether the refresh should be `targeted` or `full`.

1. If the caller provides changed files, module IDs, or graph delta proposals, start with `targeted`
2. If no reliable scope is available, or the graph may have drifted broadly, use `full`
3. Escalate from `targeted` to `full` when the localized scan reveals wider inconsistency

When the optional `grace` CLI is available, you may use `grace lint --path <project-root>` as a quick preflight before starting a broader refresh. Treat it as a hint source, not as the refresh itself.

You may also use:
- `grace module find <changed-path-or-query> --path <project-root>` to resolve the likely module scope from changed files or names
- `grace module show M-XXX --path <project-root> --with verification` to grab the shared/public contract, dependency, and verification context
- `grace file show <path> --path <project-root> --contracts --blocks` to inspect file-local/private details without rereading whole source files first

### Step 2: Scan the Selected Scope
For each file in scope, extract:
- MODULE_CONTRACT (if present)
- MODULE_MAP (if present)
- imports and exports
- CHANGE_SUMMARY (if present)
- nearby module-local test files, required log markers, and verification commands when available

Treat shared XML artifacts as public-surface documents:
- shared docs should track module boundaries, dependencies, verification refs, and public module interfaces
- private helpers and implementation-only types may exist in file headers without needing graph or plan entries

In `targeted` mode, also inspect the immediate dependency surfaces needed to validate CrossLinks accurately.

### Step 3: Compare with Shared Artifacts
Read `docs/knowledge-graph.xml` and, when present, `docs/verification-plan.xml`. Identify:
- **Missing modules**: files with MODULE_CONTRACT that are not in the graph
- **Orphaned modules**: graph entries whose files no longer exist in the scanned scope
- **Stale CrossLinks**: dependencies in the graph that do not match actual imports
- **Missing contracts**: files that should be governed by GRACE but have no MODULE_CONTRACT
- **Missing verification entries**: governed modules or tests with no corresponding `V-M-xxx` entry
- **Stale verification refs**: verification entries whose test files, commands, or required markers no longer match the scoped code
- **Escalation signals**: evidence that the problem extends beyond the scanned scope

Do not report drift just because a private helper exists in source but not in shared docs. Shared docs should only drift on public contract or dependency changes.

### Step 4: Report Drift
Present a structured report:

```text
GRACE Integrity Report
======================
Mode: targeted / full
Scope: [modules or files]
Synced modules: N
Missing from graph: [list files]
Orphaned in graph: [list entries]
Stale CrossLinks: [list]
Files without contracts: [list files]
Missing verification entries: [list modules]
Stale verification refs: [list entries]
Escalation: no / yes - reason
```

### Step 5: Fix (with user approval)
For each issue, propose a fix:
- Missing from graph - add an entry using the unique ID-based tag convention
- Orphaned - remove or repair the stale graph entry
- Stale links - update CrossLinks from actual imports
- No contracts - generate or restore the missing MODULE_CONTRACT from code analysis and plan context
- Missing verification entries - add or repair the matching `V-M-xxx` block in `docs/verification-plan.xml`
- Stale verification refs - update test files, commands, or required log markers from the real scoped code

When updating graph or plan artifacts, add only public module-facing annotations and interfaces. Keep private helper details local to the source file.

Ask the user for confirmation before applying fixes.

### Step 6: Update Shared Artifacts
Apply approved fixes to `docs/knowledge-graph.xml` and `docs/verification-plan.xml` as needed. Update versions only after the selected refresh scope is reconciled.

## Rules
- Do not scan the whole repository after every clean wave if a targeted refresh can answer the question
- Prefer controller-supplied graph delta proposals as hints, but validate them against real files
- Prefer controller-supplied verification delta proposals as hints, but validate them against real tests and commands
- Escalate to `full` whenever targeted evidence suggests broader drift

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The wave was clean, let me run a `full` refresh just to be safe" | `full` after every clean wave is exactly the anti-pattern this skill exists to prevent. If the controller handed you changed files and graph delta proposals, start `targeted` — escalate only on real evidence. |
| "Targeted refresh reported nothing, so the repository is in sync" | Targeted by definition did not inspect the whole repository. Orphans in `docs/knowledge-graph.xml` that point outside the scanned scope are invisible to targeted mode. Say "the scoped surface is clean" — not "the repository is clean". |
| "The graph matches imports, verification-plan can be refreshed next time" | `docs/verification-plan.xml` drift is just as load-bearing as graph drift: stale test paths and missing `V-M-xxx` entries silently break `$grace-fix` and `$grace-reviewer` navigation. Refresh both or escalate. |
| "A private helper is missing from the graph — add it" | Shared docs track public module surface only. Adding private helpers to `docs/knowledge-graph.xml` is noise, not drift. Skip it. |
| "Refresh is done — I can hand control back" | Not until `docs/development-plan.xml` step/phase status reflects what refresh actually confirmed as complete. Leaving status as `in-progress` after a reconciled wave is the drift you just cleaned up, reintroduced. |
| "`grace lint` passed, so no need to read the XML" | `grace lint` catches markup and tag-shape issues. It does not validate that a `CrossLink` points at a real import or that a `V-M-xxx` command still exists. Validate by reading the scoped evidence. |

## Red Flags

- You ran `full` refresh when the controller already handed you a bounded wave diff and no broad-drift signal.
- Targeted refresh found a stale `CrossLink` or an orphaned `M-xxx`, and you did not escalate to `full` even though the drift may extend beyond the scanned scope.
- You are about to emit a drift report that does not state `Mode:` and `Scope:` — the report is unverifiable without them.
- You updated `docs/knowledge-graph.xml` with private helper details that do not belong to any public module contract.
- You reconciled graph and verification-plan but left `docs/development-plan.xml` step status out of date.
- You "fixed" drift by applying edits to shared artifacts without asking the user for confirmation on the proposed changes.
- You skipped `grace module find` / `grace module show` / `grace file show` and rescanned raw files when the CLI would have given you the scoped truth cheaper.

## When NOT to Use

- You are actively implementing new modules — that is `$grace-execute` or `$grace-multiagent-execute`; refresh comes after, not during.
- You intend to rename, split, or merge modules — use `$grace-refactor` first; it updates shared artifacts atomically with the code move, making refresh redundant for that change.
- The project has no `docs/knowledge-graph.xml` or `docs/verification-plan.xml` yet — run `$grace-init` and `$grace-plan`; there is no shared surface to refresh.
- You suspect a bug in behavior, not drift in documents — use `$grace-fix`; refresh will not prove or fix a runtime bug.
- You want to evaluate whether the graph is logically correct (axes, boundaries, coverage quality) — that is `$grace-reviewer`, not refresh.
- You only need a quick health snapshot — use `$grace-status` first; it will tell you whether a refresh is even worth running.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Drift report names `Mode:` and `Scope:` explicitly (verification: `grep -n "^Mode:" <report>` and `grep -n "^Scope:" <report>`).
- [ ] Every file with a `MODULE_CONTRACT` in the scanned scope resolves to an `M-xxx` id in `docs/knowledge-graph.xml` (verification: for each changed path, `grace module find <path> --path .` returns a module).
- [ ] No orphaned entries remain for the scanned scope (verification: each `M-xxx` in the scoped section of `docs/knowledge-graph.xml` has a file that `ls` confirms exists).
- [ ] Every governed module in scope has a `V-M-xxx` entry (verification: `grep -n "V-M-" docs/verification-plan.xml` covers each `M-xxx` touched).
- [ ] `bun run grace lint --path . --allow-missing-docs` exits 0 after the refresh edits are applied.
- [ ] If `targeted` escalated to `full`: the escalation reason is written into the drift report and the `Mode:` line was updated.
- [ ] `docs/development-plan.xml` step/phase status matches reality after the reconcile (verification: `grep -nE "status=\"(pending|in-progress|completed)\"" docs/development-plan.xml` matches what refresh found).
- [ ] All edits to shared artifacts were confirmed by the user before they were written (verification: proposal was presented, approval received).
