---
name: grace-cli
description: "Operate the optional `grace` CLI against a GRACE project. Use when you want to lint GRACE artifacts, resolve modules from names or file paths, inspect shared/public module context, or inspect file-local/private markup through `grace lint`, `grace module find`, `grace module show`, and `grace file show`."
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
