---
name: grace-execute
description: "Выполнение полного GRACE-плана разработки шаг за шагом с пакетами контекста под управлением контроллера, выдержками из verification-plan, локальными ревью, поуровневой верификацией и коммитами после валидных последовательных шагов."
---

Execute the development plan step by step, generating code for each pending module with validation and commits.

## Prerequisites
- `docs/development-plan.xml` must exist with an ImplementationOrder section
- `docs/knowledge-graph.xml` must exist
- `docs/verification-plan.xml` should exist and define module-level checks for the modules you plan to execute
- if `docs/operational-packets.xml` exists, use it as the canonical packet and delta reference
- If the plan or graph is missing, stop immediately and tell the user to run `$grace-plan` themselves before large execution runs
- If the verification plan is missing or still skeletal, stop immediately and tell the user to run `$grace-verification` themselves before large execution runs
- Prefer this skill when dependency risk is higher than the gain from parallel waves, or when only a few modules remain

## Core Principle

Keep execution **sequential**, but keep context handling and verification disciplined.

- The controller parses shared artifacts once and carries the current plan state forward step by step
- Each step gets a compact execution packet so generation and review stay focused
- Reviews should default to the smallest safe scope
- Verification should be split across step, phase, and final-run levels instead of repeating whole-repo work after every clean step

## Process

### Step 1: Load and Parse the Plan Once
Read `docs/development-plan.xml`, `docs/knowledge-graph.xml`, and `docs/verification-plan.xml`, then build the execution queue.

When the optional `grace` CLI is available, `grace module show M-XXX --path <project-root> --with verification` is a fast way to seed the shared/public portion of a step packet, and `grace file show <path> --path <project-root> --contracts --blocks` is a fast way to inspect local/private details for the current write scope.

1. Collect all `Phase-N` elements where `status="pending"`
2. Within each phase, collect `step-N` elements in order
3. Build a controller-owned execution packet for each step containing:
   - module ID and purpose
   - target file paths and exact write scope
   - module contract excerpt from `docs/development-plan.xml`
   - module graph entry excerpt from `docs/knowledge-graph.xml`
   - dependency contract summaries for every module in `DEPENDS`
   - verification excerpt from `docs/verification-plan.xml`, including module-local commands, critical scenarios, required log markers, and test-file targets
    - expected graph delta fields: imports, public exports, public annotations, and CrossLinks
    - expected verification delta fields: test files, commands, required markers, and gate follow-up notes
   Use the canonical `ExecutionPacket`, `GraphDelta`, and `VerificationDelta` shapes from `docs/operational-packets.xml` when that file exists.
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

#### 2a. Implement the Module from the Step Packet
Follow this protocol for the assigned module:
- use the step packet as the primary source of truth
- generate or update code with MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY, function contracts, and semantic blocks
- generate or update module-local tests inside the approved write scope
- preserve or add stable log markers for the required critical branches
- keep changes inside the approved write scope
- run module-local verification commands from the packet only
- produce graph sync output or a graph delta proposal for the controller to apply, limited to public module interface changes
- produce a verification delta proposal for test files, commands, markers, and phase follow-up notes
- **commit the implementation immediately after verification passes** with format:
   ```
   grace(MODULE_ID): short description of what was generated
  
  Phase N, Step order
  Module: module name (module path)
  Contract: one-line purpose from development-plan.xml
  ```

#### 2b. Run Scoped Review
After generating, review the step using the smallest safe scope:
- does the generated code match the module contract from the step packet?
- are all GRACE markup conventions followed?
- do imports match `DEPENDS`?
- does the graph delta proposal match actual imports and public module interface changes?
- do the changed tests and verification evidence satisfy the packet's required scenarios and markers?
- does the verification delta proposal match the real test files and commands?
- are there any obvious security issues or correctness defects?

If critical issues are found:
1. fix them before proceeding
2. rerun only the affected scoped checks
3. escalate to a fuller `$grace-reviewer` audit only if local evidence suggests wider drift

If only minor issues are found, note them and proceed.

#### 2c. Apply Shared-Artifact Updates Centrally
After the implementation commit from Step 2a:
1. update `docs/knowledge-graph.xml` from the accepted graph sync output or graph delta proposal
2. update `docs/verification-plan.xml` from the accepted verification delta proposal
3. update step status in `docs/development-plan.xml` if the step format supports explicit completion state
4. commit shared artifacts if they changed:
   ```
   grace(meta): sync after MODULE_ID
   ```

#### 2d. Progress Report
After each step, print:
```text
--- Step order/total complete ---
Module: MODULE_ID (path)
Status: DONE
Review: scoped pass / scoped pass with N minor notes / escalated audit pass
Verification: step-level passed / follow-up required at phase level
Implementation commit: hash
Meta commit: hash (if any)
Remaining: count steps
```

### Step 3: Complete Each Phase with Broader Checks
After all steps in a phase are done:
1. update `docs/development-plan.xml`: set the `Phase-N` element's `status` attribute to `done`
2. run the phase-level verification commands or gates referenced in `docs/verification-plan.xml`
3. run `$grace-refresh` to verify graph and verification-reference integrity; prefer targeted refresh if the touched scope is well bounded, escalate to full refresh if drift is suspected
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
- If the verification plan proves too weak for the module, stop and tell the user to run `$grace-verification` themselves before continuing

## Important
- Steps within a phase are executed sequentially
- Always verify the previous step's outputs exist before starting the next step
- Parse shared XML artifacts once, then update the controller view as each step completes
- `docs/development-plan.xml` and `docs/verification-plan.xml` are shared sources of truth; never deviate from the contract or from required evidence silently
- Prefer step-level checks during generation and broader integrity checks at phase boundaries
- **Commit implementation immediately after verification passes - do not batch commits until phase end**

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Module-local verification is slow, I'll skip it and rely on phase-level checks" | Phase-level checks run only at phase boundaries; a broken step that reaches them poisons every downstream step in the same phase. The packet's `verification` excerpt from `docs/verification-plan.xml` is the minimum gate — Step 2a says "run module-local verification commands from the packet only," not "defer to phase end." |
| "I'll batch this commit with the next module to save a commit" | Explicit rule in this skill: "Commit implementation immediately after verification passes - do not batch commits until phase end." Batched commits make `grace(MODULE_ID)` bisect useless and hide which module broke verification. |
| "The neighboring module is tiny and obviously related, I'll update it in the same step" | That violates the approved write scope from the execution packet. Step 2a says "keep changes inside the approved write scope" — if the neighbor needs a change, produce a graph delta proposal or a new step, don't widen the current one. |
| "Knowledge-graph and verification-plan updates are mechanical, I'll apply them together later" | Step 2c applies shared-artifact updates centrally AFTER the implementation commit but BEFORE the next step begins. Deferring them means the next step's packet is built from a stale graph, and drift compounds silently. |
| "The step packet said DEPENDS=[A,B] but I need C, I'll just import it" | Silent DEPENDS drift is exactly what the scoped review in 2b catches ("do imports match DEPENDS?"). Either update the graph delta proposal and justify C, or stop and escalate — don't import-and-hope. |
| "Phase-level refresh can wait, no one has complained" | Step 3 requires `$grace-refresh` at each phase boundary. Graph drift between phases makes the next phase's packets wrong at step 1 — the cost of the refresh is less than the cost of one wrong packet. |
| "The failing step is blocking me, I'll skip it and come back" | Explicit rule: "Never skip a failing step; the dependency chain matters." The queue is sequential because downstream steps depend on upstream contracts; skipping is how a phase silently becomes unbuildable. |
| "I'll generate code first, then fill in MODULE_CONTRACT / MODULE_MAP / CHANGE_SUMMARY" | Contract-after-code is drift-by-construction: the contract rationalizes whatever the code happened to do. The packet gives you the contract excerpt up front — implement to it, mark up as you go, and Step 2b verifies the match. |

## Red Flags

- You are about to commit a step without having run the packet's `module-local verification commands`.
- You are holding two or more modules' changes in the working tree and planning one combined commit.
- Your diff touches files outside the step packet's approved write scope (including shared artifacts — those have their own meta commit in Step 2c).
- The graph delta proposal or verification delta proposal does not match what you actually wrote (imports in code vs. `DEPENDS` in the delta; tests on disk vs. `test files` in the delta).
- You are about to start the next step while `docs/knowledge-graph.xml` or `docs/verification-plan.xml` has not been synced from the previous step's deltas.
- A step failed verification and you are reorganizing the queue to "come back to it later" instead of stopping and reporting.
- You are at a phase boundary and have not yet run phase-level verification, `$grace-refresh`, and (if drift is suspected) a broader `$grace-reviewer` audit.
- You edited `docs/development-plan.xml` or `docs/verification-plan.xml` directly inside Step 2a instead of producing a delta proposal for Step 2c to apply centrally.

## When NOT to Use

- `docs/development-plan.xml`, `docs/knowledge-graph.xml`, or `docs/verification-plan.xml` is missing or skeletal — stop and route to `$grace-plan` / `$grace-verification`, as stated in Prerequisites.
- The plan has many independent, parallel-safe modules and throughput matters more than dependency risk — use `$grace-multiagent-execute` instead (this skill's "Prefer this skill when dependency risk is higher than the gain from parallel waves").
- The task is to rename, move, split, merge, or extract modules without generating new behavior — that is `$grace-refactor`, not `$grace-execute`.
- The task is to fix a bug in already-executed code — use `$grace-fix`, which enforces the Prove-It (failing-test-first) pipeline; `$grace-execute` does not.
- The project has no GRACE artifacts yet — run `$grace-init` first.
- You are being asked to "just finish the last step quickly without verification" — refuse; Step 2a's module-local verification is non-negotiable.

## Verification

Before claiming this skill is complete, confirm:

- [ ] Execution queue was presented and the user approved it (verification: cite the approval line in the transcript)
- [ ] Each executed step produced a separate `grace(MODULE_ID): ...` commit immediately after its module-local verification passed (verification: `git log --oneline` shows one commit per completed step, not a batched commit)
- [ ] Each step's module-local verification commands from the packet were actually run (verification: cite command + exit code per step)
- [ ] Shared-artifact updates were applied via a `grace(meta): sync after MODULE_ID` commit after each step, not inside the implementation commit (verification: `git log --grep="grace(meta):"` matches the number of steps that produced deltas)
- [ ] `docs/knowledge-graph.xml` and `docs/verification-plan.xml` were synced from the accepted deltas before the next step started (verification: `grace lint --path <project-root>` returns clean at the end of each step, or flag the specific drift)
- [ ] At each phase boundary the `Phase-N` element in `docs/development-plan.xml` has `status="done"` (verification: `grep 'Phase-N' docs/development-plan.xml` shows the updated attribute)
- [ ] At each phase boundary `$grace-refresh` and (when drift risk exists) `$grace-reviewer` were run (verification: cite the skill invocations in the transcript)
- [ ] No files outside any step's approved write scope were modified inside that step's implementation commit (verification: `git show <commit> --name-only` matches the packet's scope)
- [ ] No step was skipped after failing verification (verification: queue completion report has zero `SKIPPED` entries)
