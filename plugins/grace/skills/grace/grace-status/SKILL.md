---
name: grace-status
description: "Показать текущее состояние здоровья GRACE-проекта. Использовать для обзора артефактов проекта, метрик кодовой базы, состояния графа знаний, покрытия верификацией и подсказок по следующим шагам."
---

Show the current state of the GRACE project.

## Report Contents

### 1. Artifacts Status
Check existence and version of:
- [ ] `AGENTS.md` — GRACE principles
- [ ] `docs/knowledge-graph.xml` — version and module count
- [ ] `docs/requirements.xml` — version and UseCase count
- [ ] `docs/technology.xml` — version and stack summary
- [ ] `docs/development-plan.xml` — version and module count
- [ ] `docs/verification-plan.xml` — version and verification entry count
- [ ] `docs/operational-packets.xml` — optional packet template version

### 2. Codebase Metrics
Scan source files and report:
- Total source files
- Files WITH MODULE_CONTRACT
- Files WITHOUT MODULE_CONTRACT (warning)
- Total test files
- Test files WITH MODULE_CONTRACT
- Total semantic blocks (START_BLOCK / END_BLOCK pairs)
- Unpaired blocks (integrity violation)
- Files with stable log markers
- Test files that assert log markers or traces when relevant

### 3. Knowledge Graph and Verification Health
Quick check:
- Modules in graph vs modules in codebase
- Any orphaned or missing entries
- Modules in verification plan vs modules in development plan
- Missing or stale verification refs

If the optional `grace` CLI is available, you may also run `grace lint --path <project-root>` as a fast integrity snapshot and include any relevant findings in the report.

When the report needs focused navigation instead of raw artifact dumps, you may also use:
- `grace module find <query> --path <project-root>` to resolve the relevant module from names, IDs, dependencies, or changed paths
- `grace module show M-XXX --path <project-root> --with verification` for the shared/public module snapshot
- `grace file show <path> --path <project-root> --contracts --blocks` for the file-local/private markup snapshot

### 4. Recent Changes
List the 5 most recent CHANGE_SUMMARY entries across source and substantive test files.

### 5. Suggested Next Action
Based on the status, suggest what to do next:
- If no requirements — "Define requirements in docs/requirements.xml"
- If requirements but no plan — "Run `$grace-plan`"
- If plan exists but verification is still thin — "Run `$grace-verification`"
- If plan and verification are ready but modules are missing — "Run `$grace-execute` or `$grace-multiagent-execute`"
- If drift detected — "Run `$grace-refresh`"
- If fast integrity signals are needed before deeper review — "Run `grace lint --path <project-root>`"
- If the next step is targeted investigation of one module or file — "Run `grace module show M-XXX --path <project-root> --with verification` or `grace file show <path> --path <project-root> --contracts --blocks`"
- If tests or logs are too weak for autonomous work — "Run `$grace-verification`"
- If everything synced — "Project is healthy"

## Common Rationalizations

Thoughts that mean STOP — you are about to fabricate status instead of measuring it.

| Rationalization | Reality |
|---|---|
| "I remember the status from the last run, I can just reuse it" | GRACE artifacts drift between sessions. Reuse is how a stale snapshot gets pinned to a dashboard for a week. Re-run the scan. |
| "`--brief` is enough, the full report is overkill here" | `--brief` is a summary, not a substitute. If the caller needs to make a decision (execute, refresh, fix), run the full report. Brief mode hides the cells that flip the decision. |
| "The requirements.xml version string is recent, the doc must be in sync" | Version strings are edited by hand and lie. Cross-check with `git log --oneline -- docs/requirements.xml` before trusting the version. |
| "Coverage looks fine because most modules have tests" | "Has a test file" is not coverage. Count modules whose `V-M-xxx` entries are empty or reference missing test files — that is the real gap. |
| "Health and progress are basically the same signal" | They are orthogonal. A project can be 90% planned and 0% healthy (broken graph), or fully healthy and 10% planned. Report them separately. |
| "The user just wants a screenshot of the last report I pasted" | A pasted screenshot without a fresh scan is a vibe, not a status. If there is no fresh `grace lint` / artifact read in this session, say so instead of pretending. |

## Red Flags

Stop immediately if any of the below apply — you are producing a status report from thin air:

- You are about to report artifact versions without actually opening (or `grace module show`-ing) the XML files in this session.
- You are reporting "0 unpaired blocks" without a single `START_BLOCK_` / `END_BLOCK_` scan in the current run.
- You are citing a module count from the knowledge graph without comparing it to the real file tree.
- You are summarizing "recent changes" without reading any CHANGE_SUMMARY block in the last N minutes.
- You are recommending `$grace-execute` on a project whose verification-plan you have not opened.
- You suggest "Project is healthy" while at least one of: graph, verification-plan, development-plan, requirements was not inspected this session.

## When NOT to Use

- The user asked for a fix or a plan — route to `$grace-fix` or `$grace-plan`, not a status dump.
- The project has no `docs/` folder yet — run `$grace-init` first; status on an empty project is noise.
- The user wants to know why a single module is broken — use `grace module show M-XXX` + `$grace-fix`, not a whole-project status.
- You are inside an execution wave and the caller just needs worker-local signals — use `grace lint` / module-level checks instead of a full status report.
- The project uses an external health dashboard that is already authoritative and fresher than this skill — do not duplicate it.

## Verification

Before claiming this skill's output is trustworthy, confirm every box:

- [ ] Artifact versions were read from disk this session (verification: `ls docs/` and open each XML with Read)
- [ ] Module count in graph compared to real file tree (verification: `grep -rEn "MODULE_CONTRACT" src/ tests/ | wc -l` vs graph entries)
- [ ] Unpaired semantic blocks actively scanned (verification: `grep -rn "START_BLOCK_\|END_BLOCK_" src/` and diff the pair counts)
- [ ] Verification coverage cross-checked (verification: every `M-xxx` in `docs/development-plan.xml` has a `V-M-xxx` entry in `docs/verification-plan.xml`)
- [ ] Recent changes taken from CHANGE_SUMMARY AND git log (verification: `git log --oneline -n 10` aligns with the reported CHANGE_SUMMARY entries)
- [ ] If `grace` CLI available, `grace lint --path <project-root>` was executed and its exit code cited in the report
- [ ] Suggested Next Action maps to at least one concrete evidence bullet above, not a guess

