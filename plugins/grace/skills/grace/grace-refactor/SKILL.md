---
name: grace-refactor
description: "Refactor GRACE-governed code safely: rename, move, split, merge, or extract modules while keeping contracts, graph, verification, and semantic markup synchronized."
---

Refactor a GRACE project without letting architecture or verification drift.

## When to Use
- rename a module, file, symbol, or path
- split one module into multiple modules
- merge tightly coupled modules
- extract helpers or adapters into a new module
- move code across layers while preserving behavior
- tighten an interface or dependency surface with explicit approval

Do not use this skill for greenfield implementation. Use `$grace-plan`, `$grace-execute`, or `$grace-multiagent-execute` for new work.

## Prerequisites
- `docs/development-plan.xml` must exist
- `docs/knowledge-graph.xml` must exist
- `docs/verification-plan.xml` should exist
- if the refactor introduces new modules, removes modules, or changes contract behavior, stop and get explicit user approval before editing code
- if `docs/operational-packets.xml` exists, use its canonical packet and delta shapes

## Core Principle

A GRACE refactor is not just a code move.

It is an atomic migration across:
- source files
- test files
- semantic markup
- `docs/development-plan.xml`
- `docs/knowledge-graph.xml`
- `docs/verification-plan.xml`

The refactor is not done until all six agree again.

## Process

### Step 1: Classify the Refactor
Identify the exact refactor type:
- `rename`
- `move`
- `split`
- `merge`
- `extract`
- `interface-tighten`
- `path-only`

For the requested change, capture:
- source module IDs and file paths
- target module IDs and file paths
- behavior that must remain invariant
- approved contract changes, if any
- likely graph and verification fallout

If the change affects behavior, public contracts, or architecture boundaries, present the planned deltas and wait for approval.

### Step 2: Build a Refactor Packet
Before editing, prepare a controller-owned packet containing:
- refactor kind
- source scope
- target scope
- approved write scope
- invariants to preserve
- contract delta summary
- graph delta summary
- verification delta summary
- required local, integration, and follow-up checks

When `docs/operational-packets.xml` exists, align the packet, graph delta, verification delta, and failure handoff to those canonical templates.

### Step 3: Apply the Smallest Safe Refactor
Work in the safest order for the refactor type.

Always:
- preserve or intentionally update MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY, function contracts, and semantic blocks
- keep imports aligned with approved dependencies
- preserve or update stable `[Module][function][BLOCK_NAME]` markers when critical branches move
- move module-local tests with the behavior they verify
- prefer atomic renames over long-lived mixed states

For `split` and `merge` refactors:
- keep ownership explicit for each resulting module
- update write scopes and test scopes accordingly
- do not leave half-migrated logic spread across modules silently

### Step 4: Synchronize Shared Artifacts
After the code refactor, update the shared artifacts in one coherent pass.

Update `docs/development-plan.xml` for:
- module IDs and names
- target source/test paths
- implementation order or ownership changes
- verification references

Update `docs/knowledge-graph.xml` for:
- module tags
- annotations and exports
- CrossLinks
- verification refs

Update `docs/verification-plan.xml` for:
- `V-M-xxx` entries
- test file paths
- module-local commands
- required markers and trace assertions
- wave-level or phase-level follow-up checks

If IDs changed, update every reference atomically. Do not leave temporary stale IDs unless the user explicitly requires compatibility handling.

### Step 5: Verify by Blast Radius
Run verification at the smallest level that still protects correctness:
- renamed or moved module-local checks first
- affected integration surfaces second
- broader phase checks when coupling changed materially

If the refactor causes failures, produce a structured failure handoff using the canonical `FailurePacket` shape when available.

### Step 6: Review and Refresh
Before declaring success:
- run a scoped `$grace-reviewer` pass on the changed files and shared-artifact deltas
- run targeted `$grace-refresh` on the touched modules and dependency surfaces
- escalate to a full refresh or broader review if the refactor reveals wider drift

## Rules
- Never silently invent new architecture during a refactor
- Never leave code and shared artifacts in different realities
- Prefer smaller, narratable migrations over giant rewrites
- Keep compatibility shims only when there is a concrete requirement
- If the refactor reveals weak tests or weak logs, strengthen verification before calling it complete

## Deliverables
1. refactor kind and affected scope
2. files changed
3. graph delta proposal
4. verification delta proposal
5. verification evidence
6. remaining risks or follow-up checks
