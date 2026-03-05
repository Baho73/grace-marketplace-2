Execute the development plan step by step, generating code for each pending module with validation and commits.

## Prerequisites
- `docs/development-plan.xml` must exist with an `<ImplementationOrder>` section
- `docs/knowledge-graph.xml` must exist
- If either is missing, tell the user to run `/grace:plan` first

## Process

### Step 1: Load and Parse the Plan
Read `docs/development-plan.xml`. Parse `<ImplementationOrder>` and build the execution queue:
1. Collect all `<Phase-N>` elements where `status="pending"` (tags use unique names: `<Phase-1>`, `<Phase-2>`, etc.)
2. Within each phase, collect `<step-N>` elements (unique tags: `<step-1>`, `<step-2>`, etc.)
3. Present the execution queue to the user as a numbered list:
   ```
   Execution Queue:
   Phase N: <phase name>
     Step <order>: <module ID> — <step description>
     Step <order>: <module ID> — <step description>
   Phase N+1: ...
   ```
4. **Wait for user approval before proceeding.** The user may exclude specific steps or reorder.

### Step 2: Execute Each Step via Subagent
For each step in the approved queue, sequentially:

#### 2a. Generate Code
Launch a Task subagent (subagent_type: "general-purpose") with this prompt:
```
Run the /grace:generate command for module <MODULE_ID>.
The module is described in docs/development-plan.xml as: <step description>.
Follow the full GRACE generation protocol: load context from knowledge-graph.xml,
generate code with MODULE_CONTRACT + MODULE_MAP + CHANGE_SUMMARY + semantic blocks,
update knowledge-graph.xml with CrossLinks, and run type checking.
```

#### 2b. Code Review
After the subagent completes, launch a code-review Task subagent (subagent_type: "grace:grace-reviewer") to review:
- Does the generated code match the MODULE_CONTRACT from `development-plan.xml`?
- Are all GRACE markup conventions followed (paired blocks, unique names, ~500 token granularity)?
- Are imports correct and do they reference existing modules?
- Are there any security issues or obvious bugs?

If the review finds **critical issues** (missing contract fields, broken imports, security problems):
1. Present the issues to the user
2. Fix them before proceeding
3. Re-run the code review

If the review finds only **minor issues** (style, naming suggestions): note them and proceed.

#### 2c. Plan Review
Verify the step against the development plan:
1. Read the module's `<M-xxx>` entry in `development-plan.xml` (modules use unique ID-based tags: `<M-CONFIG>`, `<M-DB>`, etc.)
2. Confirm all `<export-xxx>` entries are implemented
3. Confirm all `<depends>` modules are imported
4. Confirm the `<contract>` inputs/outputs/errors match the implementation
5. Check that `docs/knowledge-graph.xml` was updated with the new module entry and CrossLinks

If mismatches are found — fix them before committing.

#### 2d. Commit
After validation passes:
1. Stage only the files related to this step (the generated module + updated knowledge-graph.xml)
2. Create a commit with message format:
   ```
   grace(<MODULE_ID>): <short description of what was generated>

   Phase <N>, Step <order>
   Module: <module name> (<module path>)
   Contract: <one-line purpose from development-plan.xml>
   ```
3. Report commit hash to user

#### 2e. Progress Report
After each step, print:
```
--- Step <order>/<total> complete ---
Module: <MODULE_ID> (<path>)
Status: DONE
Review: <passed / passed with N minor notes>
Commit: <hash>
Remaining: <count> steps
```

### Step 3: Phase Completion
After all steps in a phase are done:
1. Update `docs/development-plan.xml`: set the `<Phase-N>` element's `status` attribute to `"done"`
2. Run `/grace:refresh` to verify knowledge graph integrity
3. Commit the plan update:
   ```
   grace(plan): mark Phase <N> "<phase name>" as done
   ```
4. Print phase summary:
   ```
   === Phase <N> "<phase name>" COMPLETE ===
   Modules generated: <count>
   All reviews: passed
   Commits: <list of hashes>
   ```

### Step 4: Final Summary
After all phases are executed:
```
=== EXECUTION COMPLETE ===
Phases executed: <count>
Modules generated: <count>
Total commits: <count>
Knowledge graph: synced
```

## Error Handling
- If a subagent fails — stop execution, report the error, and ask the user how to proceed
- If type checking fails — attempt to fix, if unfixable stop and report
- Never skip a failing step — the dependency chain matters
- If the user interrupts (Ctrl+C) — report what was completed and what remains

## Important
- Steps within a phase are executed **sequentially** (dependencies matter)
- Independent steps at the same ORDER level within a phase **may** be parallelized via concurrent subagents if they have no shared dependencies
- Always verify the previous step's outputs exist before starting the next step
- The development plan is the source of truth — never deviate from the contract
