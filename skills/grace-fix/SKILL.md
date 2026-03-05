---
name: grace-fix
description: "Debug an issue using GRACE semantic navigation. Use when encountering bugs, errors, or unexpected behavior — navigates the knowledge graph to locate the relevant module, traces to the specific semantic block, analyzes the mismatch between contract and implementation, and applies a targeted fix."
---

Debug an issue using GRACE semantic navigation.

## Process

### Step 1: Locate via Knowledge Graph
From the error/description, identify which module is likely involved:
1. Read `docs/knowledge-graph.xml` for module overview
2. Follow CrossLinks to find the relevant module(s)
3. Read the MODULE_CONTRACT of the target module

### Step 2: Navigate to Block
If the error contains a log reference like `[Module][function][BLOCK_NAME]`:
- Search for `START_BLOCK_BLOCK_NAME` in the codebase — this is the exact location
- Read the containing function's CONTRACT for context

If no log reference:
- Use MODULE_MAP to find the relevant function
- Read its CONTRACT
- Identify the likely BLOCK by purpose

### Step 3: Analyze
Read the identified block and its CONTRACT. Determine:
- What the block is supposed to do (from CONTRACT)
- What it actually does (from code)
- Where the mismatch is

### Step 4: Fix
Apply the fix WITHIN the semantic block boundaries. Do NOT restructure blocks unless the fix requires it.

### Step 5: Update Metadata
After fixing:
1. Add a CHANGE_SUMMARY entry with what was fixed and why
2. If the fix changed the function's behavior — update its CONTRACT
3. If the fix changed module dependencies — update knowledge-graph.xml CrossLinks
4. Run type checking or linting to verify

### Important
- Never fix code without first reading its CONTRACT
- Never change a CONTRACT without user approval
- If the bug is in the architecture (wrong CONTRACT) — escalate to user, don't silently change it
