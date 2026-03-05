# GRACE Framework — AI Agent Skills

**GRACE** (Graph-RAG Anchored Code Engineering) is a methodology for AI-driven code generation with semantic markup, knowledge graphs, and contracts. Originally created by **Vladimir Ivanov** ([@turboplanner](https://t.me/turboplanner)).

GRACE provides structured scaffolding that helps LLMs generate, navigate, and maintain code with high reliability. Every module gets a contract before code exists, every code block gets semantic markers for RAG navigation, and a knowledge graph keeps the entire project map current.

This repository packages Vladimir's methodology as reusable skills for AI coding agents. It ships in two formats:

- **OpenPackage** (`openpackage.yml` + `commands/`, `agents/`, `skills/`) — universal format for 40+ coding agents
- **Claude Code Plugin** (`.claude-plugin/marketplace.json`) — native Claude Code marketplace format
- **Agent Skills** (`codex-skills/`) — [open Agent Skills specification](https://github.com/Kilo-Org/kilo-marketplace) for Codex CLI, Kilo Code, and others

## Installation

### Via OpenPackage (recommended)

Install the [OpenPackage CLI](https://github.com/enulus/OpenPackage) first (`npm install -g opkg`), then:

```bash
# Install GRACE to your workspace
opkg install gh@osovv/grace-marketplace

# Or install globally (available across all projects)
opkg install gh@osovv/grace-marketplace -g

# Install only specific resource types
opkg install gh@osovv/grace-marketplace -c    # commands only
opkg install gh@osovv/grace-marketplace -a    # agents only
opkg install gh@osovv/grace-marketplace -s    # skills only

# Install to a specific platform
opkg install gh@osovv/grace-marketplace --platforms claude-code
opkg install gh@osovv/grace-marketplace --platforms cursor
```

### Via Claude Code Plugin Marketplace

```bash
# Add the marketplace
/plugin marketplace add osovv/grace-marketplace

# Install the plugin
/plugin install grace@grace-marketplace
```

### Via npx skills (Vercel Skills CLI)

```bash
# Install GRACE skill to Claude Code
npx skills add osovv/grace-marketplace

# Or install globally (available across all projects)
npx skills add osovv/grace-marketplace -g

# Install to a specific agent
npx skills add osovv/grace-marketplace -a claude-code
```

> Browse more skills at [skills.sh](https://skills.sh)

### Via Codex CLI

Inside Codex, use the built-in skill installer to add GRACE skills:

```
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-init
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-plan
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-generate
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-execute
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-add
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-fix
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-refresh
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-status
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-ask
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-explainer
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/codex-skills/grace-reviewer
```

After installation, restart Codex to activate the skills.

### Via Kilo Code

Copy skills to your Kilo Code skills directory:

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/codex-skills/grace-* ~/.kilocode/skills/
```

Then reload the VS Code window (`Cmd+Shift+P` → "Developer: Reload Window") or restart Kilo CLI.

### Any Agent Skills-compatible agent

The `codex-skills/` directory follows the [open Agent Skills specification](https://github.com/Kilo-Org/kilo-marketplace). Each skill is a self-contained folder with a `SKILL.md` file. To use with any compatible agent, copy the skill folders to your agent's skills directory:

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/codex-skills/grace-* /path/to/your/agent/skills/
```

## Quick Start

**Claude Code:**
```bash
# Initialize GRACE structure in your project
/grace:init

# Define requirements, then plan the architecture
/grace:plan

# Generate code for a specific module
/grace:generate <module-name>

# Or execute the entire development plan
/grace:execute
```

**Codex CLI:**
```bash
# Initialize GRACE structure in your project
$grace-init

# Define requirements, then plan the architecture
$grace-plan

# Generate code for a specific module
$grace-generate <module-name>

# Or execute the entire development plan
$grace-execute
```

## Commands

| Command (Claude Code) | Skill (Codex / Kilo / Agent Skills) | Description |
|---|---|---|
| `/grace:init` | `grace-init` | Bootstrap GRACE structure |
| `/grace:plan` | `grace-plan` | Architectural planning |
| `/grace:add <desc>` | `grace-add` | Add a new module with contract |
| `/grace:generate <module>` | `grace-generate` | Generate code with GRACE markup |
| `/grace:execute` | `grace-execute` | Execute full plan with validation |
| `/grace:fix <error>` | `grace-fix` | Debug via semantic navigation |
| `/grace:refresh` | `grace-refresh` | Sync knowledge graph |
| `/grace:status` | `grace-status` | Project health report |
| `/grace:ask <question>` | `grace-ask` | Answer questions with context |

## Reference Skills

- **grace-explainer** — Complete GRACE methodology reference with detailed docs on:
  - Semantic markup — START/END block conventions, ~500 token granularity, unique block names
  - Knowledge graph — How to maintain `docs/knowledge-graph.xml`
  - Contract-driven dev — MODULE_CONTRACT, function contracts, governed autonomy (PCAM)
  - Unique tag convention — Unique ID-based XML tags that eliminate closing-tag polysemy
- **grace-reviewer** — Validates semantic markup integrity, contract completeness, graph consistency

## Agents (Claude Code only)

- **grace-architect** (Opus) — Top-down architectural planning, module decomposition, knowledge graph design
- **grace-reviewer** (Sonnet) — Integrity validation (also available as an Agent Skill for other agents)

## Compatibility

| Agent | Installation | Skills format |
|---|---|---|
| **Any (via OpenPackage)** | `opkg install` | OpenPackage (`openpackage.yml`) |
| **Claude Code** | `/plugin install` or `npx skills add` | Native plugin (`.claude-plugin/`) |
| **Codex CLI** | `$skill-installer` | Agent Skills (`codex-skills/`) |
| **Kilo Code** | Copy to `~/.kilocode/skills/` | Agent Skills (`codex-skills/`) |
| **Cursor, Windsurf, etc.** | `opkg install --platforms <name>` | OpenPackage (`openpackage.yml`) |
| **Other agents** | Copy to agent's skills directory | Agent Skills (`codex-skills/`) |

The `codex-skills/` directory follows the [open Agent Skills specification](https://github.com/Kilo-Org/kilo-marketplace) — any agent that supports this standard can use GRACE skills without modification.

The root-level `openpackage.yml` + `commands/` + `agents/` + `skills/` follow the [OpenPackage specification](https://github.com/enulus/OpenPackage) — compatible with 40+ coding agent platforms.

## Origin

GRACE was designed and battle-tested by Vladimir Ivanov ([@turboplanner](https://t.me/turboplanner)). See the [TurboProject](https://t.me/turboproject) Telegram channel for more on the methodology. This plugin extracts GRACE into a standalone, project-agnostic format.

## License

MIT
