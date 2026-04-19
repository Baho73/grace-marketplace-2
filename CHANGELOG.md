# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog, and this project follows Semantic Versioning.

This changelog currently starts at `1.3.0`. Earlier history is available in the git log.

## [4.0.0-beta.1] - 2026-04-19

**Major fork release.** This is a fork of upstream `osovv/grace-marketplace` with
substantial new surfaces. Versioned as a beta — core is stable (146/146 tests,
clean lint, self-managed reference project), but edge cases on Linux/macOS and
in long-running autonomous sessions have not been battle-tested yet. Original
author's upstream (`osovv/grace-marketplace`) is unaffected and remains 3.7.x.

### Added (new skills, 4)

- **`grace-bootstrap`** — activation protocol, runs first in any GRACE-managed
  repo. Routes user intent to the correct `grace-*` skill via a classification
  table; blocks edits until project context is loaded. `<SUBAGENT-FAST-TRACK>`
  block closes the previous loophole: subagents must `grace file show` before
  touching governed files.
- **`grace-afk`** — autonomous harness for unattended work. `/afk <hours>
  [<budget%>] [--checkpoint <min>]` runs the plan on an isolated branch with
  CLI-enforced time budget. Fire-and-forget escalations via Telegram; answers
  drain into `state.json` on every `grace afk tick`. One-way-door decisions use
  inline buttons; optional SWOT `[📖 Подробнее]` breakdown.
- **`grace-ask-human`** — short-form Telegram escalation wrapper (≤10 lines,
  strict options, 10/30/60/120 minute polling backoff).
- **`grace-evolve`** — evolutionary / comparative search over candidate
  solutions. `grace evolve init / run / show`; per-candidate git worktree
  isolation; weighted min-max scoring across ≥2 metrics; veto thresholds;
  GRACE-XML archive at `docs/experiments/<topic>/results.xml`. MVP ships
  without the LLM-critic loop (deferred to a future 4.x minor).

### Added (new CLI surfaces)

- `grace status` with `--brief` and `--format json` for SessionStart hooks.
- `grace afk` subcommand tree: `start`, `tick`, `ask`, `check`, `journal`,
  `defer`, `increment`, `report`, `stop`, `done`.
- `grace evolve` subcommand tree: `init`, `run`, `show`.
- Exit code conventions: `42 BUDGET_EXHAUSTED`, `43 NO_SESSION`,
  `44 SESSION_STOPPED`, `45 TELEGRAM_FAILURE`, `46 CONFIG_MISSING`,
  `47 SPEC_INVALID`, `48 EVOLVE_FAILED`, `2 BAD_ARGS`.
- Lint rule: warns when a `SKILL.md` lacks the three discipline sections
  (Common Rationalizations / When NOT to Use / Verification).

### Added (Telegram UX)

- Inline keyboard with callback_query. Letters A–E (as many as there are
  options) on one row, PROCEED / DEFER / STOP on a meta row, optional
  `[📖 Подробнее]` on a third row when `--details` is provided.
- Usage integration: `grace afk report` and `grace afk done` surface the
  5-hour / 7-day / extra-credit utilization read from the Claude Code
  statusline cache (`$TMPDIR/claude/statusline-usage-cache.json`).
- Project name prefix `[<Project Name>] /afk decision <corrId>` on every
  ask; deriving from kebab/snake basename via Title Case.
- Fire-and-forget model by default: `ask` registers a correlation id and
  returns immediately. `tick` drains pending callbacks on every call, ack-s
  the Telegram spinner, strips the keyboard, and records the answer into
  `state.json`. User can reply at any time; no `--wait` cap by default.

### Changed

- **Renamed** `using-grace` → `grace-bootstrap` to match the `grace-*` prefix
  convention across the marketplace.
- Phase-3 deep reworks across 5 skills:
  - `grace-fix` formalized around the **Prove-It Pattern** (failing test
    before fix; regression entry in `verification-plan.xml`).
  - `grace-reviewer` gains a **5-axis framework** (Completeness /
    Contractual Adherence / Semantic Clarity / Verification Coverage /
    Graph Integrity) with Critical / Important / Suggestion / FYI
    severity labels.
  - `grace-multiagent-execute` gains **Wave Success Thresholds** and a
    **Pre-Wave Checklist**.
  - `grace-plan` gains **phases with explicit checkpoints** and a
    **dependency-discipline** algorithm (duplicate / size / maintenance /
    license / security / blast-radius).
  - `grace-ask` gains **progressive context disclosure** (Level 1 always,
    Level 2 per-feature, Level 3 per-task, Level 4 on-demand).
- All 15 SKILL.md files gained three mandatory sections: Common
  Rationalizations, When NOT to Use, evidence-driven Verification.
- `grace-init` now emits `CLAUDE.md` with a `<CRITICAL>` activation
  preamble and `.claude/settings.json` with a SessionStart hook that runs
  `grace status --brief`. Optional `.grace-afk.json` for Telegram creds.

### Infrastructure

- Reference project: this repo itself is now GRACE-managed. `docs/
  knowledge-graph.xml`, `docs/development-plan.xml`, `docs/verification-
  plan.xml` describe 18 modules across the CLI and skill collections.
- 146 tests across 14 files; `bun test` green. 18 governed `src/*` files
  under `grace lint`, 0 errors / 0 warnings.
- Packaged plugin name (`grace`) kept stable; marketplace name
  (`grace-marketplace`) kept stable. Users swap the source via
  `/plugin marketplace remove` + `/plugin marketplace add Baho73/grace-
  marketplace-2`.

### Fixes (from external review by Gemini)

- Windows `bun.cmd` shim resolution in tests (status=null on some
  installations). Explicit platform binary naming without `shell: true`.
- Telegram `classifyAnswer` false positives: "do not STOP", "a cat",
  "I think we should PROCEED" all now classify as UNKNOWN.
- `state.json` write race via atomic `.tmp + renameSync`.
- `sendMessage` switched to plain text (no `parse_mode: Markdown`) to
  eliminate Markdown injection via user-controlled titles/contexts.

### Known limitations (Beta)

- No CI on Linux or macOS yet; all 146 tests are Windows-only for now.
- `grace-evolve` has not yet been run against a real multi-hour experiment
  — only unit-tested with an injectable exec.
- `grace-afk` longest tested session is ~30 minutes with manual stop; no
  empirical data for 8-hour overnight runs.
- Pre-existing `src/*` files (from 3.x) are not yet GRACE-marked; only the
  new 18 modules added in 4.0 are governed.

## [3.7.0] - 2026-04-05

### Added

- Added `grace-cli`, a dedicated skill for using the optional `grace` binary as a GRACE-aware lint and artifact-query layer.

### Changed

- Updated skill trigger wording to use agent-neutral `Use when you ...` phrasing instead of Claude-specific wording.
- Reworked the README install guidance so GRACE skills are the primary surface, the CLI is a strongly recommended companion, and requirements/technology artifacts are designed together with the agent.

## [3.6.0] - 2026-04-05

### Added

- Added a schema-aware GRACE query layer with `grace module find`, `grace module show`, and `grace file show`.
- Added artifact indexing that merges shared XML module records, module verification entries, implementation steps, and linked file-local markup.

### Changed

- Expanded the CLI surface from integrity-only linting into read/query navigation for public shared-doc context and private file-local context.
- Updated the shipped GRACE skills and README so agents know when to use `grace lint`, `grace module find`, `grace module show`, and `grace file show`.

## [3.5.0] - 2026-04-05

### Changed

- Clarified across the marketplace skills that `docs/development-plan.xml` and `docs/knowledge-graph.xml` should describe only public module contracts and public module interfaces.
- Kept private helpers, internal types, and implementation-only orchestration details in file-local markup, local contracts, and semantic blocks instead of shared XML artifacts.
- Updated planning, refresh, reviewer, execution, refactor, explainer, init templates, and packaged mirrors to follow that boundary consistently.

## [3.4.0] - 2026-04-05

### Changed

- Added a rich Python adapter without `pyright`, while keeping TypeScript/JavaScript on the TypeScript compiler API for exact export analysis.
- Made adapter failures non-fatal so linting can continue with structural checks and warnings.

## [3.3.0] - 2026-04-05

### Changed

- Removed profile selection from `grace lint`; it now validates only against the current GRACE artifact set.
- Limited `.grace-lint.json` to the current schema and reject unknown keys instead of carrying compatibility paths for unused legacy config.

## [3.2.0] - 2026-04-05

### Changed

- Refactored `grace lint` into a role-aware core plus language-adapter architecture with a JS/TS AST adapter.
- Added `ROLE` and `MAP_MODE` support for governed files so tests, barrels, configs, types, and scripts are linted by semantics instead of filename masks.
- Added `auto/current/legacy` profile support and `.grace-lint.json` repository configuration.

## [3.1.1] - 2026-04-05

### Changed

- Documented the optional `grace` CLI inside `grace-explainer`, `grace-reviewer`, `grace-refresh`, and `grace-status` as a fast integrity preflight.
- Updated `CLAUDE.md` so future sessions treat the published `@osovv/grace-cli` package and `grace lint` workflow as part of the repo context.
- Switched the published CLI install example in `README.md` to `bun add -g @osovv/grace-cli`.

## [3.1.0] - 2026-04-05

### Added

- Added `grace-refactor` for safe rename, move, split, merge, and extract workflows with synchronized contracts, graph entries, and verification refs.
- Added `docs/operational-packets.xml` templates to `grace-init` so projects get canonical `ExecutionPacket`, `GraphDelta`, `VerificationDelta`, and `FailurePacket` shapes.
- Added a Bun-based `grace` CLI on `citty` with a `lint` subcommand for unique XML tags, graph/plan/verification drift, and semantic markup integrity.

### Changed

- Updated execution, verification, ask, fix, status, and explainer skills to recognize `docs/operational-packets.xml` when present.
- Prepared the published CLI as the scoped npm package `@osovv/grace-cli` with a Bun-powered `grace` binary and prepublish verification checks.

## [3.0.4] - 2026-04-05

### Changed

- Improved worker commit message format in `grace-multiagent-execute`: requires concrete file/function/export listing and descriptive body instead of generic "harden X" phrases.
- Improved controller meta-sync commit format: lists which artifacts were updated and per-module delta description instead of bare module list.

## [3.0.3] - 2026-03-19

### Fixed

- Replaced the `plugins/grace/skills` symlink with real packaged skill files so OpenPackage can install the plugin for `opencode`.
- Added validator coverage for drift between canonical `skills/grace/*` content and the packaged copy inside `plugins/grace`.

## [3.0.2] - 2026-03-19

### Fixed

- Re-aligned the Claude Code marketplace layout with the official docs by serving the `grace` plugin from `./plugins/grace`.
- Restored the plugin manifest to `plugins/grace/.claude-plugin/plugin.json` and removed the unsupported root plugin manifest.
- Updated marketplace validation to enforce relative plugin sources and to verify component paths inside each plugin source directory.

## [3.0.1] - 2026-03-19

### Fixed

- Restored Claude Code marketplace packaging to use the repository root as the plugin source so bundled skill paths resolve inside the installed plugin.
- Added a root `.claude-plugin/plugin.json` manifest and removed the broken nested `plugins/grace` packaging layout.
- Updated validation to catch missing component paths inside the declared plugin source before release.

## [3.0.0] - 2026-03-16

### Added

- Added `docs/verification-plan.xml` as a first-class GRACE artifact template.
- Added richer `grace-init` templates for requirements, technology, development plan, and knowledge graph.
- Added GRACE explainer reference material for verification-driven and log-driven development.

### Changed

- Reframed `grace-verification` around maintained testing, traces, and log-driven evidence.
- Updated `grace-plan` to produce verification references and populate `verification-plan.xml`.
- Updated `grace-execute` and `grace-multiagent-execute` to consume verification-plan excerpts in execution packets and sync verification deltas centrally.
- Updated `grace-reviewer`, `grace-status`, `grace-refresh`, `grace-ask`, and `grace-fix` to treat verification as part of GRACE integrity.
- Refreshed README, packaging metadata, and installation paths for the nested `skills/grace/*` layout.

### Removed

- Removed `grace-generate` from the public skill set in favor of the execution-centric workflow through `grace-execute` and `grace-multiagent-execute`.

## [2.1.0] - 2026-03-09

### Changed

- Workers now commit their implementation immediately after verification passes, rather than waiting for controller.
- Controller commits only shared artifacts (graph, plan), not implementation files.
- Updated `grace-execute` and `grace-multiagent-execute` with explicit commit timing guidance.

## [2.0.0] - 2026-03-09

### Changed

- Reorganized skills directory structure: all GRACE skills moved to `skills/grace/` subfolder for better organization and namespacing.

## [1.3.0] - 2026-03-09

### Added

- Added `safe`, `balanced`, and `fast` execution profiles to `grace-multiagent-execute`.
- Added controller-built execution packets to reduce repeated plan and graph reads during execution.
- Added targeted graph refresh guidance for wave-level reconciliation.
- Added explicit verification levels for module, wave, and phase checks.
- Added this `CHANGELOG.md` file.

### Changed

- Aligned `grace-execute` with the newer packet-driven, controller-managed execution model.
- Updated `grace-generate` to support controller-friendly graph delta proposals in multi-agent workflows.
- Updated `grace-reviewer` to support `scoped-gate`, `wave-audit`, and `full-integrity` review modes.
- Updated `grace-refresh` to distinguish between `targeted` and `full` refresh modes.
- Updated GRACE subagent role prompts to match scoped reviews, controller-owned shared artifact updates, and level-based verification.
- Updated `README.md` and package metadata for the `1.3.0` release.

### Fixed

- Resolved the workflow conflict where `grace-generate` previously implied direct `knowledge-graph.xml` edits even when `grace-multiagent-execute` required controller-owned graph synchronization.
