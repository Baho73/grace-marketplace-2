# GRACE Framework - AI Agent Skills

**GRACE** (Graph-RAG Anchored Code Engineering) is a methodology for AI-driven code generation with semantic markup, knowledge graphs, contracts, and log-driven verification. Originally created by **Vladimir Ivanov** ([@turboplanner](https://t.me/turboplanner)).

This repository packages GRACE as reusable skills for coding agents. The current workflow is opinionated around:

- contract-first planning
- verification-first execution
- semantic markup for navigation and patching
- knowledge-graph synchronization
- controller-managed sequential or multi-agent implementation

Current packaged version: `3.2.0`

## What Changed In This Version

- Documented the published Bun-powered `grace` CLI more explicitly across skills and repo context.
- Added `grace lint` guidance as a fast integrity preflight alongside reviewer, refresh, and status workflows.
- Updated the public install example to use `bun add -g @osovv/grace-cli`.

## Repository Layout

- `skills/grace/` - Agent Skills format
- `.claude-plugin/` - Claude Code marketplace packaging
- `openpackage.yml` - OpenPackage metadata

## Installation

### Via OpenPackage (recommended)

Install the [OpenPackage CLI](https://github.com/enulus/OpenPackage) first (`npm install -g opkg`), then:

```bash
# Install GRACE to your workspace
opkg install gh@osovv/grace-marketplace

# Or install globally
opkg install gh@osovv/grace-marketplace -g

# Install only specific resource types
opkg install gh@osovv/grace-marketplace -s
opkg install gh@osovv/grace-marketplace -a

# Install to a specific platform
opkg install gh@osovv/grace-marketplace --platforms claude-code
opkg install gh@osovv/grace-marketplace --platforms cursor
opkg install gh@osovv/grace-marketplace --platforms opencode
```

### Via Claude Code Plugin Marketplace

```bash
/plugin marketplace add osovv/grace-marketplace
/plugin install grace@grace-marketplace
```

### Via npx skills (Vercel Skills CLI)

```bash
npx skills add osovv/grace-marketplace
npx skills add osovv/grace-marketplace -g
npx skills add osovv/grace-marketplace -a claude-code
```

> Browse more skills at [skills.sh](https://skills.sh)

### Via Bun (CLI)

Requires `bun` on `PATH`. The published CLI keeps the Bun shebang and installs the `grace` binary.

```bash
bun add -g @osovv/grace-cli
grace lint --path /path/to/grace-project
```

### Via Codex CLI

Inside Codex, use the built-in skill installer:

```text
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-init
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-plan
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-execute
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-multiagent-execute
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-refactor
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-setup-subagents
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-fix
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-refresh
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-status
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-ask
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-explainer
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-verification
$skill-installer install https://github.com/osovv/grace-marketplace/tree/main/skills/grace/grace-reviewer
```

After installation, restart Codex to activate the skills.

### Via Kilo Code

Copy skills to your Kilo Code skills directory:

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/skills/grace/grace-* ~/.kilocode/skills/
```

### Any Agent Skills-compatible agent

```bash
git clone https://github.com/osovv/grace-marketplace
cp -r grace-marketplace/skills/grace/grace-* /path/to/your/agent/skills/
```

## Quick Start

```bash
# 1. Bootstrap GRACE docs and templates
/grace-init

# 2. Fill requirements.xml and technology.xml

# 3. Plan modules, flows, graph, and verification refs
/grace-plan

# 4. Deepen testing, traces, and log-driven evidence
/grace-verification

# 5a. Execute the plan sequentially
/grace-execute

# 5b. Execute in parallel-safe waves
/grace-multiagent-execute
```

`/grace-multiagent-execute` supports `safe`, `balanced`, and `fast` controller profiles. Use `balanced` by default, `safe` for risky or weakly verified modules, and `fast` only when module-local and wave-level verification are already strong.

## Core Artifacts

- `docs/requirements.xml` - product intent and use cases
- `docs/technology.xml` - runtime, tooling, testing, observability, constraints
- `docs/development-plan.xml` - modules, contracts, flows, phases, execution ownership
- `docs/verification-plan.xml` - tests, traces, required log markers, and gates
- `docs/knowledge-graph.xml` - project navigation graph
- `docs/operational-packets.xml` - canonical execution packet, delta, and failure handoff templates

## Skills

| Skill | Description |
|---|---|
| `grace-init` | Bootstrap GRACE docs, AGENTS, and XML templates |
| `grace-plan` | Architect modules, flows, knowledge graph, and verification refs |
| `grace-verification` | Design and maintain tests, traces, and log-driven evidence |
| `grace-execute` | Execute the full plan sequentially with scoped review and commits |
| `grace-multiagent-execute` | Execute independent modules in controller-managed parallel waves |
| `grace-refactor` | Refactor modules safely while keeping contracts, graph, and verification synchronized |
| `grace-setup-subagents` | Scaffold shell-specific GRACE worker and reviewer presets |
| `grace-fix` | Debug via semantic navigation, tests, and log markers |
| `grace-refresh` | Sync shared artifacts with the real codebase |
| `grace-status` | Project health report across docs, graph, and verification |
| `grace-ask` | Answer questions with full project context |
| `grace-explainer` | Complete GRACE methodology reference |
| `grace-reviewer` | Validate semantic markup, contracts, graph, and verification integrity |

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

## Development

Run the marketplace validator from the repository root:

```bash
bun run ./scripts/validate-marketplace.ts
```

Run the GRACE lint CLI against a GRACE project:

```bash
bun install
bun run grace lint --path /path/to/grace-project
```

The lint command is role-aware and adapter-aware:

- structural checks stay language-agnostic
- export-map parity uses language adapters where available
- file behavior is driven by semantic roles instead of filename masks

Optional `MODULE_CONTRACT` fields for linting:

```text
ROLE: RUNTIME | TEST | BARREL | CONFIG | TYPES | SCRIPT
MAP_MODE: EXPORTS | LOCALS | SUMMARY | NONE
```

Default behavior:

- `RUNTIME` => strict export parity when a language adapter is available
- `TEST` => `MODULE_MAP` describes important locals, fixtures, and helpers instead of exports
- `BARREL` => `MODULE_MAP` can summarize aggregated exports
- `CONFIG` => export parity is skipped by default
- `TYPES` => type export surfaces are checked when the adapter supports them
- `SCRIPT` => `MODULE_MAP` describes important local entry points and helpers instead of exports

Optional repository config file:

```json
{
  "profile": "auto",
  "ignoredDirs": ["tmp"]
}
```

Profiles:

- `auto` => require `docs/verification-plan.xml` only when the repo already looks verification-aware
- `current` => require current GRACE artifacts
- `legacy` => allow older GRACE repos without a verification plan

The validator checks marketplace/plugin metadata sync, version consistency, required fields, `.claude-plugin` structure, and hardcoded absolute paths. In branch or PR context it scopes validation to changed plugins via `git diff origin/main...HEAD`; otherwise it validates all plugins.

## Origin

GRACE was designed and battle-tested by Vladimir Ivanov ([@turboplanner](https://t.me/turboplanner)). See the [TurboProject](https://t.me/turboproject) Telegram channel for more on the methodology. This repository extracts GRACE into a standalone, project-agnostic format.

## License

MIT
