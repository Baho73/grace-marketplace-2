---
name: grace-cli
description: "Работа с опциональным `grace` CLI в GRACE-проекте. Использовать, когда нужно проверить GRACE-артефакты линтером, найти модули по именам или путям файлов, посмотреть общий/публичный контекст модуля или файловую/приватную разметку через `grace lint`, `grace module find`, `grace module show` и `grace file show`."
---

Use the optional `grace` CLI as a fast GRACE-aware read/query layer.

## Prerequisites

- The `grace` binary must be installed and available on `PATH`
- The target repository should already use GRACE artifacts and markup
- Prefer `--path <project-root>` unless you are already in the project root

If the CLI is missing, or the repository is not a GRACE project, say so and fall back to reading the relevant docs and code directly.

## Choose the Right Command

- `grace lint --path <project-root>`
  Use for a fast integrity snapshot across semantic markup, XML artifacts, and export/map drift.
- `grace module find <query> --path <project-root>`
  Use to resolve module IDs from names, paths, dependencies, annotations, verification refs, or file-local `LINKS`.
- `grace module show <id-or-path> --path <project-root>`
  Use to read the shared/public module view from `development-plan.xml`, `knowledge-graph.xml`, implementation steps, and linked files.
- `grace module show <id> --with verification --path <project-root>`
  Use when you also need the module's verification excerpt.
- `grace file show <path> --path <project-root>`
  Use to read file-local/private `MODULE_CONTRACT`, `MODULE_MAP`, and `CHANGE_SUMMARY`.
- `grace file show <path> --contracts --blocks --path <project-root>`
  Use when you also need function/type contracts and semantic block navigation.

## Recommended Workflow

1. Run `grace lint` when integrity or drift matters.
2. Run `grace module find` to resolve the target module from the user's words, a stack trace, or a changed path.
3. Run `grace module show` for the shared/public truth.
4. Run `grace file show` for the file-local/private truth.
5. Read the underlying XML or source files only for the narrowed scope that still needs deeper evidence.

## Output Guidance

- Use default text output for quick review and direct user-facing summaries.
- Use `--json` when another tool, script, or agent step needs machine-readable output.
- Treat CLI output as navigation help, not as a replacement for the real XML and source files when exact evidence is required.

## Public/Private Rule

- `grace module show` is for shared/public module context.
- `grace file show` is for file-local/private implementation context.
- If shared docs and file-local markup disagree, call out the drift instead of silently trusting one side.

## Important

- The CLI is a companion to the GRACE skills, not a replacement for them.
- Prefer this skill when the task is to inspect, navigate, or lint a GRACE project quickly through the CLI.
- For methodology design, execution planning, refresh, review, or fixes, route to the appropriate `grace-*` skill after using the CLI to narrow scope.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I remember the `grace` subcommands, I can type them from memory" | CLI flags drift between releases. Run `grace --help` or read `src/grace.ts` and `src/grace-lint.ts` before composing a command — hallucinated flags produce silent no-ops that look like clean output. |
| "I'm already inside the project, `--path` is optional, I'll omit it" | Omitting `--path` only works when cwd is exactly the project root. Agent threads often reset cwd between bash calls (see env note), so an omitted `--path` silently resolves against the wrong tree. Always pass `--path <project-root>`. |
| "`grace module show` gave me MODULE_CONTRACT, that's the full story" | `grace module show` is the SHARED/public plane only. File-local MODULE_CONTRACT, MODULE_MAP, and CHANGE_SUMMARY live in the source file and require `grace file show <path> --contracts --blocks`. Stopping at `module show` is how private drift gets missed. |
| "`grace lint` passed, so the artifacts are coherent" | `grace lint` catches markup pairing, XML unique-tag anti-patterns, and export/map drift — it does NOT validate contract semantics or that DEPENDS matches real imports. A clean lint is a guardrail, not a correctness proof; escalate to `$grace-reviewer` for contract-level claims. |
| "The CLI output is machine-readable, I can paraphrase it to the user" | Default text output is formatted for humans; paraphrasing loses evidence. When another step consumes the result, pass `--json` and cite the field; when the user asks for exact evidence, quote the CLI stdout or open the underlying XML. |
| "If the CLI isn't installed I'll just skip this skill" | The skill explicitly says to say so and fall back to reading `docs/*.xml` and source files directly. Silently skipping leaves the user thinking the inspection happened. |

## Red Flags

- You composed a `grace` command without `--path <project-root>` while working from an agent thread whose cwd may have reset.
- You reported shared/public module info from `grace module show` and called it "the module context" without also running `grace file show` for local/private markup.
- You quoted `grace lint` output as proof of correctness of a CONTRACT or DEPENDS claim instead of routing to `$grace-reviewer`.
- You invented or guessed a flag (e.g. `--deep`, `--all`, `--verbose`) that is not present in `src/grace.ts` / `src/grace-lint.ts`.
- You used default text output to feed another automated step instead of passing `--json`.
- Shared docs (`grace module show`) and file-local markup (`grace file show`) disagreed and you picked a side silently instead of reporting the drift.

## When NOT to Use

- The `grace` binary is not installed or not on `PATH` — say so and fall back to reading `docs/*.xml` and source files directly; do not fabricate CLI output.
- The repository has no GRACE artifacts yet (`docs/development-plan.xml` and `docs/knowledge-graph.xml` missing) — route the user to `$grace-init` instead of running `grace lint` against an empty project.
- The task is methodology design, execution planning, refresh, review, fixes, or Q&A — route to `$grace-plan`, `$grace-execute`, `$grace-refresh`, `$grace-reviewer`, `$grace-fix`, or `$grace-ask`. Use this skill only for CLI-driven inspection.
- The user needs exact evidence (file:line citations for a review or fix) — CLI output summarizes; open the underlying XML and source files for load-bearing quotes.
- You need to mutate artifacts — the `grace` CLI is a read/query layer, not an editor. Use `$grace-refresh`, `$grace-execute`, or manual edits for writes.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Every invoked `grace` command included `--path <project-root>` (verification: `grep -E "grace (lint|module|file)" <transcript> | grep -v -- --path` returns nothing)
- [ ] The command set matches the task intent: `grace lint` for integrity, `grace module find` to resolve IDs, `grace module show` for shared/public, `grace file show` for file-local/private (verification: name which command answered which question)
- [ ] For every shared/public claim you also ran `grace file show` when local/private markup could contradict it (verification: cite both stdout blocks)
- [ ] Any drift between `grace module show` and `grace file show` was called out explicitly, not silently resolved (verification: grep your report for the word "drift" or an equivalent)
- [ ] If the CLI was missing or the project was not a GRACE project, the report explicitly said so and switched to reading `docs/*.xml` (verification: cite the fallback path)
- [ ] When downstream automation consumed CLI output, the command used `--json` (verification: grep the transcript for `--json`)
