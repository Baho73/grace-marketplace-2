# Independent Review Prompt for grace-marketplace

Self-contained prompt for another model (Claude, GPT-4/5, Gemini, etc.) to produce a responsible, evidence-driven code review of the two active feature branches. The reviewer must have file-read + shell access to the repository.

---

## Your role

You are a senior engineer independently reviewing two feature branches of a TypeScript/Bun project that ships a methodology (GRACE) as Claude Code skills + CLI. You were NOT the author. Your job is to find real problems and to cite them with concrete file paths and line numbers. Rubber-stamping is a failure mode — a pristine report on a large diff is almost always a sign you did not look.

**Hard rule: before you open your mouth, verify every claim by reading the actual file at the cited line.** If you cannot reproduce a symptom (e.g. "this exits 255 on Windows"), either run the reproduction or label the claim as "unverified".

---

## Repository

- **Root:** `D:/Python/GRACE_2/grace-marketplace-2` (Windows; Bash under Git for Windows is available). On POSIX systems, adjust the drive prefix accordingly.
- **Runtime:** Bun 1.3+ (install via `npm install -g bun` if missing).
- **Entry points:**
  - CLI: `src/grace.ts` → subcommands in `src/grace-{lint,module,file,status,afk}.ts`
  - Tests: `src/*.test.ts`, run with `bun test`
  - Marketplace validator: `bun run ./scripts/validate-marketplace.ts`
  - Self-lint: `bun run ./src/grace.ts lint --path .`
- **Canonical skills:** `skills/grace/*/SKILL.md`
- **Packaged mirror (must stay byte-identical to canonical):** `plugins/grace/skills/grace/*/SKILL.md`
- **Marketplace manifest:** `.claude-plugin/marketplace.json`
- **Project GRACE artifacts:** `docs/knowledge-graph.xml`, `docs/development-plan.xml`, `docs/verification-plan.xml`
- **Plan of record:** `PLAN.md` at root

---

## Branches under review

### Branch A — `feature/hardening-pass-1`
- **Baseline:** git tag `baseline-v3.7.0`
- **Tip:** git tag `hardening-pass-1-tip`
- **Diff command:** `git log --oneline baseline-v3.7.0..hardening-pass-1-tip`
- **What shipped (for context, not to trust):**
  - Meta-skill `grace-bootstrap` (initially `using-grace`) enforcing an activation protocol with `<EXTREMELY-IMPORTANT>` block
  - `grace-init` now emits `CLAUDE.md.template`, `.claude/settings.json.template` (SessionStart hook running `grace status --brief`)
  - New CLI subcommand `grace status` with `--brief` and `--format json` (`src/grace-status*.ts`)
  - New lint rule warning when SKILL.md lacks "Common Rationalizations" / "When NOT to Use" / "Verification" sections (`src/lint/skill-sections.ts`)
  - Phase-2 sweep: all 15 SKILL.md files gained those three sections
  - Phase-3 deep reworks: `grace-fix` (Prove-It Pattern), `grace-reviewer` (5-axis framework), `grace-multiagent-execute` (Wave Success Thresholds + Pre-Wave Checklist), `grace-plan` (phases + checkpoints + dependency discipline), `grace-ask` (progressive disclosure)
  - Self-managed: `docs/knowledge-graph.xml`, `docs/development-plan.xml`, `docs/verification-plan.xml` describe the CLI modules and skill collections

### Branch B — `feature/grace-afk`
- **Baseline:** git tag `hardening-pass-1-tip` (branched from the tip of Branch A)
- **Tip:** current HEAD of `feature/grace-afk`
- **Diff command:** `git log --oneline hardening-pass-1-tip..feature/grace-afk`
- **What shipped:**
  - Rename `using-grace` → `grace-bootstrap` across all files (including marketplace.json, docs/*.xml, templates)
  - Subagent-loophole fix: `<SUBAGENT-STOP>` → `<SUBAGENT-FAST-TRACK>` (subagents must run `grace file show` before edits and flag contract changes in their return packet)
  - `AGENTS.md.template` gained a "Scope Completion Rule" requiring both `bun test` and `grace lint` to exit 0
  - New CLI subcommand `grace afk` (9 verbs: `start / tick / ask / check / journal / defer / increment / report / stop`)
    - **Key design point:** CLI enforces the time budget via `docs/afk-sessions/<id>/state.json` with `expiresAt`. Exit codes are load-bearing: 42 BUDGET_EXHAUSTED, 43 NO_SESSION, 44 SESSION_STOPPED, 45 TELEGRAM_FAILURE, 46 CONFIG_MISSING, 2 BAD_ARGS
  - Native Telegram Bot API transport with dependency-injected fetch for tests (`src/afk/telegram.ts`)
  - Session state store with atomic `.tmp` + `renameSync` writes (`src/afk/session.ts`)
  - Journal writers + config loader (`src/afk/journal.ts`, `src/afk/config.ts`)
  - Skills `grace-afk` and `grace-ask-human` (Telegram escalation wrapper)
  - `.grace-afk.json.template` + `grace-init` option to emit it and add to `.gitignore`

Treat these summaries as claims, not facts. Your job is to verify what was actually shipped.

---

## Review framework

Apply the 5-axis framework defined in `skills/grace/grace-reviewer/SKILL.md`. For each finding, assign one of four severity labels:

| Severity | Meaning |
|---|---|
| **Critical** | Blocks merge. Safety bug, integrity violation, or anything that can leak credentials or cause data loss. |
| **Important** | Will cause drift if not fixed soon. Should fix in same PR or open follow-up. |
| **Suggestion** | Improvement, not a defect. Acceptable to defer. |
| **FYI** | Informational context for future maintainers. |

### The 5 axes

1. **Completeness** — Does the knowledge graph cover every changed module? Is every step status accurate? Every V-M-xxx referenced by the plan actually declared?
2. **Contractual Adherence** — Do implementations match their contracts? Function signatures match documented INPUTS/OUTPUTS? Implementations stay inside declared write scope?
3. **Semantic Clarity** — START_BLOCK/END_BLOCK paired and uniquely named? Block sizes reasonable? Log markers in the code match those declared in verification-plan? Are NEW governed files actually governed (MODULE_CONTRACT present)?
4. **Verification Coverage** — Does every changed module have a V-M-xxx? Do the tests declared in verification-plan actually exist and actually run the scenarios? Do bug fixes add regression entries?
5. **Graph Integrity** — Do graph-delta claims match actual imports? Any cycles? Orphan entries? One-sided CrossLinks? Does development-plan step status match reality on disk?

---

## Concrete things to check (not an exhaustive list)

Treat these as hypotheses to falsify. If any of these turns out to be already-handled, move on. If any is confirmed, it is a finding.

### Security
- `.grace-afk.json` contains a Telegram bot token. Is it gitignored in this repo? In `skills/grace/grace-init/assets/grace-afk.json.template`? What happens if a user runs `grace afk start` and forgets?
- Does `sendMessage` in `src/afk/telegram.ts` treat user-controlled fields (title/context/options) as trusted? Any markdown / html / URL-injection path?
- Any secrets that could leak via stderr, process.argv, or logs?

### Race conditions and idempotency
- Does `src/afk/session.ts` write state.json atomically? What happens if two `grace afk tick` run concurrently?
- Can `newSessionId` collide within a single millisecond? Is there a defensive suffix?
- What if the agent runs `grace afk start` twice in the same repo? Does the second one clobber the first, or is it refused?

### CLI exit-code hygiene
- Every `process.exit(...)` or `process.exitCode = ...` — is the numeric code documented and consistent? Or is there a mix of generic `exit(1)` and specific codes?
- Do exit codes actually propagate through the `bun run` vs `bun file.ts` vs `.cmd` shim layers on Windows? (The repo author hit this: `bun run` via a `.cmd` shim can rewrite codes to 255.)

### Test coverage
- Does `bun test` pass? How many tests, how many files?
- For each V-M-xxx in `docs/verification-plan.xml` — does the declared `test-files` exist? Do the declared scenarios actually have assertions that exercise them?
- Is there a test for the path where `.grace-afk.json` is missing? For the max-escalations cap? For free-form Telegram replies like "do not STOP" that should NOT classify as STOP?

### Semantic markup dogfood
- Run `grep -c "START_MODULE_CONTRACT"` across `src/**/*.ts`. Do new modules have it? Do pre-existing modules? How many "Governed files checked" does `grace lint` report?
- For files that DO have markup — do MODULE_MAP symbol names match actual exports?

### CLI flag consistency
- Are argument names consistent across subcommands (e.g. is `--context` canonical, or does it differ between `ask` / `journal` / `defer`)?
- Does `--options "A:x|B:y"` work on Windows cmd? (Pipe character is a cmd operator.)

### Documentation consistency
- Does `PLAN.md` reflect the state of the branches? Are completed PRs marked as shipped? Are stale open questions pruned?
- Do `CHANGELOG.md` / `README.md` mention the new features?
- Do the SKILL.md files reference the current skill names (not stale ones)?

### Marketplace sync
- Run `bun run ./scripts/validate-marketplace.ts`. Does it pass?
- Are canonical `skills/grace/*` and packaged `plugins/grace/skills/grace/*` byte-identical?
- Are all declared skills in `.claude-plugin/marketplace.json` present on disk?

---

## What to do

1. **Read first.** Clone (or pull) the repository. Run:
   ```bash
   cd D:/Python/GRACE_2/grace-marketplace-2
   git log --oneline baseline-v3.7.0..hardening-pass-1-tip
   git log --oneline hardening-pass-1-tip..feature/grace-afk
   git diff baseline-v3.7.0..hardening-pass-1-tip --stat
   git diff hardening-pass-1-tip..feature/grace-afk --stat
   ```
2. **Run the gates yourself.** Do not trust the author's claims.
   ```bash
   bun install
   bun test
   bun run ./scripts/validate-marketplace.ts
   bun run ./src/grace.ts lint --path .
   bun run ./src/grace.ts status --brief --path .
   ```
   Record the exit code and full output of each.
3. **Walk the 5 axes.** For each axis, spend real time — do not skim. Open files. Follow references. Check that every claim in XML artifacts is backed by code or tests.
4. **Build a punch list.** Finding = one bullet. Each bullet must contain `file:line` and an unambiguous severity label.
5. **Run a reproduction when you can.** For suspected bugs, write a one-liner that demonstrates the issue (or demonstrates the fix works). Include the command and its observed output in the finding.
6. **Deliver the report in the format below.**

---

## Required output format

```
# GRACE Review — feature/hardening-pass-1 + feature/grace-afk

## Gates (reproduced locally)
- bun test:              [N pass / M fail]
- validate-marketplace:  [PASS | FAIL — reason]
- grace lint:            [errors / warnings / governed files]
- grace status --brief:  [1-line summary]

## Axis 1 — Completeness
**Verdict: PASS | PASS-WITH-HOLES | FAIL**
- [severity] [file:line] description — required action

## Axis 2 — Contractual Adherence
...

## Axis 3 — Semantic Clarity
...

## Axis 4 — Verification Coverage
...

## Axis 5 — Graph Integrity
...

## Cross-cutting findings
(Issues that span multiple axes, e.g. security, performance, DX.)

## Summary table
| Axis | Score | Critical | Important | Suggestion/FYI |
|---|---|---|---|---|

## Verdict
APPROVE | APPROVE-WITH-FIXES | BLOCK — one-sentence reason.

## Relevant paths
(Flat list of every file you cited, absolute paths.)
```

---

## Non-goals

- Do not rewrite the code yourself. Your output is a report, not a commit.
- Do not summarize what the branches did. The author already knows. Find problems.
- Do not flag minor style preferences as blocking. Reserve Critical for safety, integrity, and data-loss risks.
- Do not pad the report. Short, specific findings with citations beat paragraphs of generic worries.

If a finding seems borderline, say so honestly and mark it FYI. Calibration matters.
