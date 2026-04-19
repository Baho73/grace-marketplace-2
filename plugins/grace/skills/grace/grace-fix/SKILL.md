---
name: grace-fix
description: "Отладка и исправление проблемы через GRACE-семантическую навигацию с паттерном Prove-It. Использовать при встрече с багами, ошибками или неожиданным поведением — пройти по графу, плану верификации и семантическим блокам, написать ПАДАЮЩИЙ тест, который доказывает баг, применить точечное исправление, убедиться в прохождении теста и защититься от регрессии."
---

Debug and fix an issue using GRACE semantic navigation — with a **failing test written before the fix**.

## Prove-It Pattern

A bug that is not reproduced in a test is not proven. A fix that does not flip a test from red to green
is not verified. Every bug fix produced by this skill goes through the following pipeline:

```
Locate → Prove (write RED test) → Fix → Verify (test goes GREEN) → Guard (regression entry)
```

Skipping any phase is drift. In particular: fixing before writing a failing test is forbidden.

## Process

### Step 1: Locate via Knowledge Graph
From the error/description, identify which module is likely involved:
1. Read `docs/knowledge-graph.xml` for module overview
2. Read `docs/verification-plan.xml` for relevant scenarios, test files, or log markers if available
3. Read `docs/operational-packets.xml` for the canonical `FailurePacket` shape if available
4. Follow CrossLinks to find the relevant module(s)
5. Read the MODULE_CONTRACT of the target module

If the optional `grace` CLI is available, you may use:
- `grace module find <query> --path <project-root>` to resolve likely module IDs from stack traces, paths, verification refs, or dependency names
- `grace module show M-XXX --path <project-root> --with verification` to pull the shared/public module and verification snapshot
- `grace file show <path> --path <project-root> --contracts --blocks` when you already know the governed file and need its local/private navigation surface

### Step 2: Navigate to Block
If the error contains a log reference like `[Module][function][BLOCK_NAME]`:
- Search for `START_BLOCK_BLOCK_NAME` in the codebase — this is the exact location
- Read the containing function's CONTRACT for context

If the failure came from a named verification scenario or test:
- read the matching `V-M-xxx` entry in `docs/verification-plan.xml`
- open the mapped test file and expected evidence for that scenario

If no log reference:
- Use MODULE_MAP to find the relevant function
- Read its CONTRACT
- Identify the likely BLOCK by purpose

### Step 3: Analyze
Read the identified block, its CONTRACT, and relevant verification entry. Determine:
- What the block is supposed to do (from CONTRACT)
- What evidence should prove that behavior (from tests, traces, or log markers)
- What it actually does (from code)
- **Where exactly the mismatch is** — in a single sentence ("the JOIN returns duplicates because the filter is applied post-aggregation")

Distinguish root cause from symptom. Never fix a symptom while the root cause remains ("dedupe in UI" is a patch; "fix the JOIN" is a fix).

### Step 4: Prove — write a FAILING test FIRST (RED)

**This step is not optional. A bug that is not reproduced in a test is not proven.**

1. Open the existing test file for the affected module (or create one under the path declared in `V-M-xxx`).
2. Write a single minimal test that:
   - exercises the exact code path that produces the bug
   - asserts the expected correct behavior (what SHOULD happen)
   - names the test with a reference to the original failure (`"regression: GH#123 duplicate rows in list endpoint"`)
3. Run only this test. It MUST fail. If it passes, you have not reproduced the bug — stop and return to Step 3.
4. Record the observed failure output verbatim — it becomes part of the `FailurePacket` evidence.

If the bug is deep inside a block that cannot be reached from a unit test, add a narrower integration
test or a property-based case. Do not skip the RED step by claiming "this cannot be tested".

### Step 5: Fix
Apply the fix WITHIN the semantic block boundaries. Do NOT restructure blocks unless the fix requires
it. Keep the change scoped to the root cause — no drive-by refactors, no adjacent cleanup.

### Step 6: Verify — test goes GREEN
Re-run the test written in Step 4. It MUST pass. If it still fails, the fix is wrong — return to Step 5.
If it passes, run the full module-local verification suite to confirm no neighboring tests regressed.

### Step 7: Guard — update metadata and regression entry
After the fix is verified:
1. Add a CHANGE_SUMMARY entry with what was fixed and why (one or two sentences, reference the failure).
2. If the fix changed the function's behavior — update its CONTRACT.
3. If the fix changed module dependencies — update `docs/knowledge-graph.xml` CrossLinks.
4. Add or update the regression test entry in `docs/verification-plan.xml` for the affected module:
   - reference the new test file and test name
   - add the failure scenario to the `<scenarios>` block
   - add any new log markers that would help diagnose a recurrence
5. If the failure revealed weak tests, weak logs, or poor execution-trace visibility — use
   `$grace-verification` to strengthen automated checks before considering the issue fully closed.

### Step 8: Commit test + fix together
Produce a single commit containing:
- the new failing-then-passing test
- the fix itself
- the metadata updates (CHANGE_SUMMARY, verification-plan, graph updates as needed)

Commit message format:
```
grace(MODULE_ID): fix <short description>

Regression test: tests/<file>::<test-name>
Root cause: <one sentence>
Verification: V-M-xxx updated with <scenario>
```

## Common Rationalizations

Thoughts that mean STOP — you are about to skip the Prove-It discipline.

| Rationalization | Reality |
|---|---|
| "The fix is trivial, a regression test is overkill" | Trivial bugs reappear. Without the test the fix is only temporary. The test IS the fix's guarantee. |
| "I'll reproduce it in my head" | If it is not in code it is not reproduced. Head-reproduction is how wrong fixes ship. |
| "I already see the bug, writing a test is wasted time" | Writing the test takes 2-5 minutes and often reveals that the bug is NOT where you thought. |
| "The test is hard to write because of setup" | That is a signal the module has testability debt. Adding the test surfaces the debt for the next engineer. |
| "I'll add the test after" | You will not. By the time the fix is committed, the failure mode is gone and you cannot verify the RED step. |
| "The bug is in a third-party library, no test needed" | Write a test at YOUR boundary that pins the observed-external-behavior contract. When the third party fixes it upstream, your test will flag the change. |
| "Root cause is unclear, so I'll patch the symptom first" | Patching the symptom buries the root cause. Either invest to find the root cause, or label the PR as a short-term workaround and open a follow-up ticket. |
| "Updating the verification plan is bureaucracy" | Verification plan is the only thing that stops this exact bug from regressing silently in a year. |

## Red Flags

Stop immediately if any of the below apply — you are off the rails:

- You have edited source code before writing the failing test.
- Your "test" does not actually fail against the unpatched code.
- You are fixing a symptom in one module when the root cause is in another module.
- Your fix changes a MODULE_CONTRACT without user approval.
- You are about to commit without updating `docs/verification-plan.xml`.
- The regression test's name does not reference the real failure (generic names like `"it works"` mean you did not understand the bug).

## When NOT to Use

- Pure cosmetic edits (typo in a comment, formatting-only change) — these are not bug fixes.
- Deliberate architectural change — use `$grace-plan` + `$grace-execute` or `$grace-refactor` instead.
- The "bug" is actually an architectural mistake in the CONTRACT — escalate to user, do not silently change the contract.
- You cannot reproduce the issue at all — DO NOT invent a fix. Return to the user with the investigation log and ask for clarification.
- The failure is an infrastructure / environment issue (DNS, disk full, CI runner flake) — handle outside of GRACE.

## Important
- Never fix code without first reading its CONTRACT
- Never change a CONTRACT without user approval
- If the bug is in the architecture (wrong CONTRACT) — escalate to user, don't silently change it
- The RED step is load-bearing: an unwritten test = unproven bug = possibly no bug at all

## Verification

Before claiming this skill is complete, confirm every box:

- [ ] Affected module located in `docs/knowledge-graph.xml` (verification: name the M-xxx id)
- [ ] Failing test exists and initially fails (verification: attach RED run output)
- [ ] Fix applied WITHIN existing semantic blocks (verification: no new top-level blocks unless approved)
- [ ] Test passes after fix (verification: attach GREEN run output)
- [ ] Module-local verification suite passes (verification: attach command + result)
- [ ] CHANGE_SUMMARY entry added (verification: grep the file for the new entry)
- [ ] `docs/verification-plan.xml` updated with regression entry (verification: grep for the new test name)
- [ ] Commit message cites root cause, test path, and V-M-xxx reference
