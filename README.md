# GRACE Framework — AI Agent Skills

**GRACE** (Graph-RAG Anchored Code Engineering) is a methodology for AI-driven code generation with semantic markup, knowledge graphs, and contracts. Originally created by **Vladimir Ivanov** ([@turboplanner](https://t.me/turboplanner)).

GRACE provides structured scaffolding that helps LLMs generate, navigate, and maintain code with high reliability. Every module gets a contract before code exists, every code block gets semantic markers for RAG navigation, and a knowledge graph keeps the entire project map current.

This repository packages Vladimir's methodology as reusable skills for AI coding agents. All skills live in `skills/` and follow the [Agent Skills](https://agentskills.io) open standard. The repository ships in three compatible formats:

- **OpenPackage** (`openpackage.yml`) — universal format for 40+ coding agents via [opkg](https://github.com/enulus/OpenPackage)
- **Claude Code Plugin** (`.claude-plugin/marketplace.json`) — native Claude Code marketplace
- **Agent Skills** (`skills/`) — [open Agent Skills specification](https://github.com/Kilo-Org/kilo-marketplace) for Codex CLI, Kilo Code, and others

## Installation

### Via OpenPackage (recommended)

Install the [OpenPackage CLI](https://github.com/enulus/OpenPackage) first (`npm install -g opkg`), then:

```bash
# Install GRACE to your workspace
opkg install gh@osovv/grace-marketplace

# Or install globally (available across all projects)
opkg install gh@osovv/grace-marketplace -g

# Install only specific resource types
opkg install gh@osovv/grace-marketplace -s    # skills only
opkg install gh@osovv/grace-marketplace -a    # agents only

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
# Install GRACE skills to Claude Code
npx skills add osovv/grace-marketplace

# Or install globally (available across all projects)
npx skills add osovv/grace-marketplace -g

# Install to a specific agent
npx skills add osovv/grace-marketplace -a claude-code
```

> Browse more skills at [skills.sh](https://skills.sh)

### Via Codex CLI

Inside Codex, use the built-in skill installer:

```
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-init
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-plan
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-generate
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-execute
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-multiagent-execute
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-setup-subagents
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-fix
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-refresh
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-status
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-ask
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-explainer
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-verification
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace-reviewer
```

After installation, restart Codex to activate the skills.

### Via Kilo Code

Copy skills to your Kilo Code skills directory:

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/skills/grace-* ~/.kilocode/skills/
```

Then reload the VS Code window (`Cmd+Shift+P` > "Developer: Reload Window") or restart Kilo CLI.

### Any Agent Skills-compatible agent

The `skills/` directory follows the [Agent Skills](https://agentskills.io) open standard. Each skill is a self-contained folder with a `SKILL.md` file. To use with any compatible agent:

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/skills/grace-* /path/to/your/agent/skills/
```

## Quick Start

```bash
# Initialize GRACE structure in your project
/grace-init

# Define requirements, then plan the architecture
/grace-plan

# Generate code for a specific module
/grace-generate <module-name>

# Or execute the entire development plan
/grace-execute

# Or execute independent modules in parallel waves
# Default profile: balanced
/grace-setup-subagents
/grace-multiagent-execute
```

`/grace-multiagent-execute` now supports `safe`, `balanced`, and `fast` controller profiles. Use `balanced` by default, `safe` for risky or weakly verified modules, and `fast` only when module-local and wave-level verification are already strong.

## Skills

| Skill | Description |
|---|---|
| `grace-init` | Bootstrap GRACE structure (docs/, templates, knowledge graph) |
| `grace-plan` | Architectural planning — module breakdown, contracts, knowledge graph |
| `grace-generate` | Generate code for a module with full GRACE markup |
| `grace-execute` | Execute full plan with validation and commits |
| `grace-multiagent-execute` | Execute plan in parallel waves with safe/balanced/fast controller-managed integrity profiles |
| `grace-setup-subagents` | Scaffold shell-specific GRACE subagent presets |
| `grace-fix` | Debug via semantic navigation |
| `grace-verification` | Design AI-friendly verification, logs, and trace checks |
| `grace-refresh` | Sync knowledge graph with codebase |
| `grace-status` | Project health report |
| `grace-ask` | Answer questions with full project context |
| `grace-explainer` | Complete GRACE methodology reference |
| `grace-reviewer` | Validate semantic markup, contracts, and graph consistency |

## Compatibility

| Agent | Installation | Format |
|---|---|---|
| **Any (via OpenPackage)** | `opkg install` | OpenPackage (`openpackage.yml`) |
| **Claude Code** | `/plugin install` or `npx skills add` | Native plugin (`.claude-plugin/`) |
| **Codex CLI** | `$skill-installer` | Agent Skills (`skills/`) |
| **Kilo Code** | Copy to `~/.kilocode/skills/` | Agent Skills (`skills/`) |
| **Cursor, Windsurf, etc.** | `opkg install --platforms <name>` | OpenPackage (`openpackage.yml`) |
| **Other agents** | Copy to agent's skills directory | Agent Skills (`skills/`) |

All skills follow the [Agent Skills](https://agentskills.io) open standard and the [OpenPackage](https://github.com/enulus/OpenPackage) specification.

## Origin

GRACE was designed and battle-tested by Vladimir Ivanov ([@turboplanner](https://t.me/turboplanner)). See the [TurboProject](https://t.me/turboproject) Telegram channel for more on the methodology. This repository extracts GRACE into a standalone, project-agnostic format.

## License

MIT
