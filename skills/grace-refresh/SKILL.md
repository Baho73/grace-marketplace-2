---
name: grace-refresh
description: "Synchronize the GRACE knowledge graph with the actual codebase. Use after manual code changes, refactoring, or when you suspect drift between the knowledge graph and the code — scans all source files, detects missing/orphaned modules and stale CrossLinks, and proposes fixes."
---

Synchronize the knowledge graph with the actual codebase.

## Process

### Step 1: Scan Codebase
Find all source files in the project. For each file, extract:
- MODULE_CONTRACT (if present)
- MODULE_MAP (if present)
- All imports (to determine dependencies)
- CHANGE_SUMMARY (if present)

### Step 2: Compare with Knowledge Graph
Read `docs/knowledge-graph.xml`. Identify:
- **Missing modules**: files with MODULE_CONTRACT that are not in the graph
- **Orphaned modules**: graph entries whose files no longer exist
- **Stale CrossLinks**: dependencies in the graph that don't match actual imports
- **Missing contracts**: files that have no MODULE_CONTRACT at all

### Step 3: Report Drift
Present a structured report:
```
GRACE Integrity Report
=======================
Synced modules: N
Missing from graph: [list files]
Orphaned in graph: [list entries]
Stale CrossLinks: [list]
Files without contracts: [list files]
```

### Step 4: Fix (with user approval)
For each issue, propose a fix:
- Missing from graph — add entry using unique ID-based tag (M-xxx NAME="..." TYPE="...") with fn-name, type-Name annotation tags. See AGENTS.md "Documentation Artifacts" for full convention.
- Orphaned — remove from graph
- Stale links — update CrossLinks from actual imports
- No contracts — generate MODULE_CONTRACT from code analysis

**Ask user for confirmation before applying fixes.**

### Step 5: Update Graph
Apply approved fixes to `docs/knowledge-graph.xml`. Update version.
