---
name: grace-init
description: "Bootstrap GRACE framework structure for a new project. Use when starting a new project with GRACE methodology - creates docs/ directory, AGENTS.md, CLAUDE.md (Claude Code activation), .claude/settings.json (SessionStart hook), and XML templates for requirements, technology, development plan, verification plan, knowledge graph, and operational packet contracts."
---

Initialize GRACE framework structure for this project.

## Template Files

All documents MUST be created from template files located in this skill's `assets/` directory.
Read each template file, replace the `$PLACEHOLDER` variables with actual values gathered from the user, and write the result to the target project path.

| Template source                          | Target in project           | Purpose |
|------------------------------------------|-----------------------------|---------|
| `assets/AGENTS.md.template`              | `AGENTS.md` (project root)  | GRACE protocol for any agent |
| `assets/CLAUDE.md.template`              | `CLAUDE.md` (project root)  | Claude Code activation preamble |
| `assets/settings.json.template`          | `.claude/settings.json`     | SessionStart hook: runs `grace status --brief` on session start |
| `assets/grace-afk.json.template`         | `.grace-afk.json` (optional)| Telegram config for `grace-afk`. User MUST gitignore this file. |
| `assets/docs/knowledge-graph.xml.template` | `docs/knowledge-graph.xml`  | |
| `assets/docs/requirements.xml.template`    | `docs/requirements.xml`     | |
| `assets/docs/technology.xml.template`      | `docs/technology.xml`       | |
| `assets/docs/development-plan.xml.template`| `docs/development-plan.xml` | |
| `assets/docs/verification-plan.xml.template`| `docs/verification-plan.xml` | |
| `assets/docs/operational-packets.xml.template`| `docs/operational-packets.xml` | |

> **Important:** Never hardcode template content inline. Always read from the `.template` files — they are the single source of truth for document structure.

## Steps

1. **Gather project info from the user.** Ask for:
   - Project name and short annotation
   - Main keywords (for domain activation)
   - Primary language, runtime, and framework (with versions)
   - Key libraries/dependencies (if known)
   - Testing stack (test runner, assertion style, mock/fake approach)
   - Observability stack (logger, structured log fields, redaction constraints)
   - High-level module list (if known)
   - 2-5 critical flows or risky surfaces that must be verifiable early

2. **Create `docs/` directory and populate documents from templates:**

    For each `assets/docs/*.xml.template` file:
    - Read the template file
    - Replace `$PLACEHOLDER` variables with user-provided values
    - Write the result to the corresponding `docs/` path

3. **Create or verify `AGENTS.md` at project root:**
    - If `AGENTS.md` does not exist — read `assets/AGENTS.md.template`, fill in `$KEYWORDS` and `$ANNOTATION`, and write to project root
    - If `AGENTS.md` already exists — warn the user and ask whether to overwrite or keep the existing one

4. **Create or verify `CLAUDE.md` at project root (activation preamble for Claude Code):**
    - If `CLAUDE.md` does not exist — read `assets/CLAUDE.md.template`, fill in `$PROJECT_NAME`, `$ANNOTATION`, and `$KEYWORDS`, and write to project root
    - If `CLAUDE.md` already exists — show the user the template's `<CRITICAL>` activation preamble and ask whether to prepend it to the existing file, overwrite, or skip

5. **Create `.claude/settings.json` (SessionStart hook):**
    - If `.claude/settings.json` does not exist — create `.claude/` directory, read `assets/settings.json.template`, write to `.claude/settings.json`
    - If `.claude/settings.json` already exists — inform the user, show the template content, and ask whether to merge the `hooks.SessionStart` entry into the existing file or skip. Never silently overwrite existing settings.

6. **Offer `grace-afk` config (optional):**
    - Ask the user if they plan to use the autonomous harness (`grace-afk`).
    - If yes — read `assets/grace-afk.json.template`, fill `$TELEGRAM_BOT_TOKEN` / `$TELEGRAM_CHAT_ID` from the user, write to `.grace-afk.json`, and REMIND the user to add it to `.gitignore` (verify `.gitignore` contains `.grace-afk.json` and add the line if missing).
    - If no — skip; the user can add it later.

7. **Print a summary** of all created files and suggest the next step:
    > "GRACE structure initialized. On your next Claude Code session, the SessionStart hook will surface `grace status --brief`. Run `$grace-plan` to design modules, data flows, and verification references. Then use `$grace-verification` to deepen tests, traces, and log-driven evidence before large execution waves. Use `docs/operational-packets.xml` as the canonical packet and delta reference during execution and refactors."

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "User already has CLAUDE.md, skip that step" | Without the GRACE `<CRITICAL>` preamble, Claude will not activate the protocol. Offer to prepend it rather than skip. |
| "Settings.json hook is optional, user can add later" | Users forget. Hook is the primary defense against "Claude forgot GRACE exists". Offer merge, do not skip. |
| "XML templates are boilerplate, I can generate inline" | Templates evolve between GRACE versions. Always read from `assets/` — never hardcode. |
| "One-person project, AGENTS.md is overkill" | The future agent IS a different person. AGENTS.md is the handoff. |

## When NOT to Use

- Project is already GRACE-initialized (artifacts present in `docs/`). Use `$grace-refresh` or `$grace-status` instead.
- The user is not committed to GRACE methodology — installing the scaffolding without buy-in creates abandoned artifacts.
- The project is a throwaway prototype or spike. Init only when the code is expected to live past one sitting.

## Verification

After running this skill:

- [ ] `docs/` contains all 6 XML files from templates (verification: `ls docs/*.xml | wc -l` returns 6)
- [ ] `AGENTS.md` exists and contains GRACE keywords (verification: `grep -c "MODULE_CONTRACT" AGENTS.md` ≥ 1)
- [ ] `CLAUDE.md` exists and contains the `<CRITICAL>` activation preamble (verification: `grep "<CRITICAL>" CLAUDE.md`)
- [ ] `.claude/settings.json` exists with the SessionStart hook (verification: `grep "grace status" .claude/settings.json`)
- [ ] If the user opted in to `grace-afk`: `.grace-afk.json` exists AND `.gitignore` contains `.grace-afk.json` (verification: `grep -F ".grace-afk.json" .gitignore`)
- [ ] Next recommended skill announced to user (verification: output contains `$grace-plan`)
