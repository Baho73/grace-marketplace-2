---
name: grace-setup-subagents
description: "Создание пресетов GRACE-субагентов для текущей агентской оболочки. Использовать, когда нужно сгенерировать файлы worker- и reviewer-агентов GRACE для Claude Code, OpenCode, Codex или другой оболочки."
---

Create GRACE subagent files for the current shell by reusing the shell's own agent-file conventions.

## Purpose

`$grace-multiagent-execute` works best when the shell already has GRACE-specific worker and reviewer presets.

This skill scaffolds those presets into the correct local agent directory for the current shell.

The controller remains in the main session. Workers should expect compact execution packets, fresh one-module ownership, scoped reviews, and controller-managed graph updates.

## Default Roles

By default, create these subagents:

1. `grace-module-implementer`
2. `grace-contract-reviewer`
3. `grace-verification-reviewer`
4. `grace-fixer`

The main session remains the controller. This skill does **not** create a controller agent.

## Process

### Step 1: Detect the Current Shell
Use the current environment and project structure to determine where the skill is running.

Prefer, in this order:

1. explicit environment hints from the shell
2. project-local config directories
3. user-level agent directories

Typical examples:
- Claude Code projects often use `.claude/`
- OpenCode projects often use `.opencode/`
- Codex projects often use `.codex/`

If detection is ambiguous, ask the user which shell to target.

### Step 2: Find a Real Agent File Example
Do **not** guess the target file format if a local example exists.

Search for an existing agent file for the current shell:
- first in the current project
- then in the user's global config for that shell
- then in nearby projects if needed

Use a real example to infer:
- file extension
- frontmatter or config structure
- model field names
- tool/permission layout

If no reliable local example exists:
- look for official shell documentation
- if documentation is still unclear, ask the user for a canonical sample or doc link

### Step 3: Choose Scope and Target Directory
Default to project-local setup unless the user explicitly asks for global setup.

Create the GRACE presets under the shell's local agent directory in a `grace/` subfolder when the shell supports subfolders cleanly.

If the shell does not support nested subfolders for agents, place the generated files directly in the local agent directory with GRACE-prefixed names.

### Step 4: Read the Role Prompts
The role prompt bodies live in `references/roles/`:

- `references/roles/module-implementer.md`
- `references/roles/contract-reviewer.md`
- `references/roles/verification-reviewer.md`
- `references/roles/fixer.md`

These are the shared role bodies. Reuse them. Only the shell-specific wrapper should change.

These shared prompts assume the newer multi-agent workflow:
- workers receive execution packets instead of rereading full XML artifacts whenever possible
- reviewers default to scoped gate review and escalate only when evidence suggests wider drift
- verification is split across module, wave, and phase levels
- the controller owns `docs/verification-plan.xml` in addition to plan and graph artifacts

### Step 5: Render Shell-Specific Agent Files
For each role:

1. wrap the shared role body in the file format discovered in Step 2
2. preserve the shell's conventions for:
   - metadata fields
   - model names
   - permissions or tool declarations
   - subagent mode flags
3. write the file into the target directory

If the shell has no first-class subagent file concept, create the nearest useful equivalent and explain the limitation.

### Step 6: Report What Was Created
After scaffolding, report:

- detected shell
- target directory
- created files
- any assumptions copied from the local example
- any fields the user should adjust manually, such as model aliases

## Rules
- Prefer copying the shell's real local format over inventing one
- Keep prompts aligned with `grace-multiagent-execute`, `grace-reviewer`, `grace-fix`, and `grace-verification`
- Do not overwrite existing files without user intent
- Do not create architecture-planning agents here; this skill is for execution support
- Do not introduce worker-pool or worker-reuse assumptions into the generated presets
- If the shell supports agents differently, create the nearest working equivalent and explain the difference

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Claude Code and OpenCode look similar enough — I can reuse the same frontmatter" | Frontmatter fields (model aliases, permission blocks, subagent mode flags) diverge silently between shells. Always confirm against a real local example from Step 2 before writing any file. |
| "One combined `grace-worker-reviewer` agent is simpler than four separate roles" | Mixing worker and reviewer duties in one preset breaks the execution-packet contract: workers own a single module's write scope, reviewers operate read-only across the wave. Never merge the roles. |
| "I will skip Step 2 and write the file from memory — I know this shell" | Shell formats change. Rendering from memory is how you ship a preset that the shell silently ignores. Find a real local example, or ask for a canonical sample. |
| "The shared role body in `references/roles/*.md` is generic, let me rewrite it" | The shared bodies carry the execution-packet, scoped-review, and three-level verification assumptions that the whole multi-agent workflow depends on. Only the shell wrapper should change. |
| "AGENTS.md is documentation, it does not need to mention the new presets" | `AGENTS.md` is how `$grace-multiagent-execute` discovers which presets to dispatch. A preset that is not listed there will not be picked up by the controller. |
| "Global install is fine — I will scope it later" | Project-local is the default for a reason: global presets leak across unrelated repositories and hide GRACE version skew. Install to the project's local agent directory unless the user explicitly overrode. |

## Red Flags

- You wrote preset files without first locating a real local agent-file example for the target shell.
- The generated presets combine worker and reviewer responsibilities in a single file, or omit one of the four default roles (`grace-module-implementer`, `grace-contract-reviewer`, `grace-verification-reviewer`, `grace-fixer`).
- You created a `grace-controller` or `grace-planner` agent — this skill is strictly execution support, not architecture.
- An existing file with the same name was overwritten without explicit user intent.
- `AGENTS.md` was not updated to point at the new presets after scaffolding.
- The shell-specific frontmatter (model field names, permission blocks, subagent flags) was guessed rather than copied from the local example.
- The shared role body from `references/roles/*.md` was rewritten or paraphrased instead of embedded verbatim.
- Presets were installed globally when the user did not ask for global scope.

## When NOT to Use

- The user runs a single-agent workflow and has no intention of calling `$grace-multiagent-execute` — there is nothing to scaffold.
- The shell has no subagent or preset concept at all, and the user has not asked for a nearest-equivalent workaround — do not create files the shell will ignore.
- The project already has working GRACE presets and the user only wants them edited — use direct edits, not this scaffolding skill.
- The user is asking for a planner or controller agent — that is outside this skill's scope; return and clarify.
- No `references/roles/*.md` exist in the skill bundle (packaging drift) — stop and report the missing shared role bodies; do not invent them.
- The target shell cannot be detected and the user cannot confirm it — do not guess; ask for the shell name first.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Detected shell and target directory are named explicitly in the final report (verification: report lists `Shell:` and `Target:`).
- [ ] All four default role files exist at the target path (verification: `ls <target-dir>/grace-module-implementer.* <target-dir>/grace-contract-reviewer.* <target-dir>/grace-verification-reviewer.* <target-dir>/grace-fixer.*`).
- [ ] Each generated file embeds the corresponding shared role body verbatim (verification: `diff <(sed -n '/^---$/,/^---$/!p' <generated>) references/roles/<role>.md` shows only the wrapper differences).
- [ ] Frontmatter fields match the local example from Step 2 (verification: `head -n 20 <local-example>` and `head -n 20 <generated>` share the same field shape).
- [ ] `AGENTS.md` references the newly created presets (verification: `grep -n "grace-module-implementer\|grace-contract-reviewer\|grace-verification-reviewer\|grace-fixer" AGENTS.md`).
- [ ] No controller or planner agent was generated (verification: `ls <target-dir>` contains no `grace-controller*` or `grace-planner*` files).
- [ ] No pre-existing files were silently overwritten (verification: for each created file, confirm it did not exist before or the user explicitly approved the overwrite).
- [ ] Model aliases and permission blocks flagged in the report as fields the user may need to adjust manually.
