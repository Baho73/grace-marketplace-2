---
name: grace-execute
description: "Execute the full GRACE development plan step by step with controller-managed context packets, scoped reviews, level-based verification, and commits after validated sequential steps."
---

Execute the development plan step by step, generating code for each pending module with validation and commits.

## Prerequisites
- `docs/development-plan.xml` must exist with an ImplementationOrder section
- `docs/knowledge-graph.xml` must exist
- If either is missing, tell the user to run `$grace-plan` first
- Prefer this skill when dependency risk is higher than the gain from parallel waves, or when only a few modules remain

## Core Principle

Keep execution **sequential**, but keep context handling and verification disciplined.

- The controller parses shared artifacts once and carries the current plan state forward step by step
- Each step gets a compact execution packet so generation and review stay focused
- Reviews should default to the smallest safe scope
- Verification should be split across step, phase, and final-run levels instead of repeating whole-repo work after every clean step

## Process

### Step 1: Load and Parse the Plan Once
Read `docs/development-plan.xml` and `docs/knowledge-graph.xml`, then build the execution queue.

1. Collect all `Phase-N` elements where `status="pending"`
2. Within each phase, collect `step-N` elements in order
3. Build a controller-owned execution packet for each step containing:
   - module ID and purpose
   - target file paths and exact write scope
   - module contract excerpt from `docs/development-plan.xml`
   - module graph entry excerpt from `docs/knowledge-graph.xml`
   - dependency contract summaries for every module in `DEPENDS`
   - step-level verification commands
   - expected graph delta fields: imports, exports, annotations, and CrossLinks
4. Present the execution queue to the user as a numbered list:
   ```text
   Execution Queue:
   Phase N: phase name
     Step order: module ID - step description
     Step order: module ID - step description
   Phase N+1: ...
   ```
5. Wait for user approval before proceeding. The user may exclude specific steps or reorder.

### Step 2: Execute Each Step Sequentially
For each approved step, process exactly one module at a time.

#### 2a. Generate Code from the Step Packet
Follow the `$grace-generate` protocol for this module:
- use the step packet as the primary source of truth
- generate code with MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY, function contracts, and semantic blocks
- keep changes inside the approved write scope
- run step-level verification only
- produce graph sync output or a graph delta proposal for the controller to apply

#### 2b. Run Scoped Review
After generating, review the step using the smallest safe scope:
- does the generated code match the module contract from the step packet?
- are all GRACE markup conventions followed?
- do imports match `DEPENDS`?
- does the graph delta proposal match actual imports and exports?
- are there any obvious security issues or correctness defects?

If critical issues are found:
1. fix them before proceeding
2. rerun only the affected scoped checks
3. escalate to a fuller `$grace-reviewer` audit only if local evidence suggests wider drift

If only minor issues are found, note them and proceed.

#### 2c. Apply Shared-Artifact Updates Centrally
After the step passes scoped review:
1. update `docs/knowledge-graph.xml` from the accepted graph sync output or graph delta proposal
2. update step status in `docs/development-plan.xml` if the step format supports explicit completion state
3. keep shared artifact edits controller-owned even though execution is sequential

If plan or graph mismatches are found, fix them before committing.

#### 2d. Commit the Validated Step
After validation passes:
1. stage only the files related to this step, including any approved shared-artifact updates
2. create a commit with message format:
   ```text
   grace(MODULE_ID): short description of what was generated

   Phase N, Step order
   Module: module name (module path)
   Contract: one-line purpose from development-plan.xml
   ```
3. report the commit hash to the user

#### 2e. Progress Report
After each step, print:
```text
--- Step order/total complete ---
Module: MODULE_ID (path)
Status: DONE
Review: scoped pass / scoped pass with N minor notes / escalated audit pass
Verification: step-level passed / follow-up required at phase level
Commit: hash
Remaining: count steps
```

### Step 3: Complete Each Phase with Broader Checks
After all steps in a phase are done:
1. update `docs/development-plan.xml`: set the `Phase-N` element's `status` attribute to `done`
2. run wave-equivalent or phase-level integration checks for the surfaces touched in the phase
3. run `$grace-refresh` to verify knowledge graph integrity; prefer targeted refresh if the touched scope is well bounded, escalate to full refresh if drift is suspected
4. run a broader `$grace-reviewer` audit if the phase introduced non-trivial shared-artifact changes or drift risk
5. commit the phase update if it was not already included in the final step commit:
   ```text
   grace(plan): mark Phase N "phase name" as done
   ```
6. print a phase summary

### Step 4: Final Summary
After all phases are executed:
```text
=== EXECUTION COMPLETE ===
Phases executed: count
Modules generated: count
Total commits: count
Knowledge graph: synced
Verification: phase checks passed / follow-up required
```

## Error Handling
- If a step fails, stop execution, report the error, and ask the user how to proceed
- If step-level verification fails, attempt to fix it; if unfixable, stop and report
- If targeted refresh or scoped review reveals broader drift, escalate before continuing
- Never skip a failing step; the dependency chain matters

## Important
- Steps within a phase are executed sequentially
- Always verify the previous step's outputs exist before starting the next step
- Parse shared XML artifacts once, then update the controller view as each step completes
- The development plan is the source of truth; never deviate from the contract
- Prefer step-level checks during generation and broader integrity checks at phase boundaries
