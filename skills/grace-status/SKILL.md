---
name: grace-status
description: "Show the current health status of a GRACE project. Use to get an overview of project artifacts, codebase metrics, knowledge graph health, and suggested next actions — helps identify drift, missing contracts, or unpaired semantic blocks."
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

### 2. Codebase Metrics
Scan source files and report:
- Total source files
- Files WITH MODULE_CONTRACT
- Files WITHOUT MODULE_CONTRACT (warning)
- Total semantic blocks (START_BLOCK / END_BLOCK pairs)
- Unpaired blocks (integrity violation)

### 3. Knowledge Graph Health
Quick check:
- Modules in graph vs modules in codebase
- Any orphaned or missing entries

### 4. Recent Changes
List the 5 most recent CHANGE_SUMMARY entries across all files.

### 5. Suggested Next Action
Based on the status, suggest what to do next:
- If no requirements — "Define requirements in docs/requirements.xml"
- If requirements but no plan — "Run `$grace-plan`"
- If plan but missing modules — "Run `$grace-generate module` or `$grace-execute`"
- If drift detected — "Run `$grace-refresh`"
- If everything synced — "Project is healthy"
