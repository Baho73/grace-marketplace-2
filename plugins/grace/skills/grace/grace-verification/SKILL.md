---
name: grace-verification
description: "Design and enforce testing, traces, and log-driven verification for a GRACE project. Use when modules need stronger automated tests, execution-trace checks, or a maintained verification-plan.xml that autonomous and multi-agent workflows can trust."
---

Design verification that autonomous agents can trust: deterministic where possible, observable and traceable where equality checks alone are not enough.

## Prerequisites
- `docs/development-plan.xml` must exist with planned modules or module contracts
- `docs/verification-plan.xml` should exist; if it does not, create it from the GRACE init template before proceeding
- if `docs/operational-packets.xml` exists, use its `FailurePacket` shape for failure handoff output
- Read the relevant `MODULE_CONTRACT`, function contracts, semantic blocks, and existing tests first
- If no contract exists yet, route through `$grace-plan` before building verification

## Goal

Verification in GRACE is not just "did the final value match?"

It must answer:
- did the system produce the correct result?
- did it follow an acceptable execution path?
- can another agent debug the failure from the evidence left behind?

Use contracts for **expected behavior**, semantic blocks for **traceability**, and tests/logs for **evidence**.

`docs/verification-plan.xml` is the canonical place where this evidence model lives.

## Process

### Step 1: Load Verification Context
Read the smallest complete set of artifacts needed for the scope:

- `docs/requirements.xml`
- `docs/technology.xml`
- `docs/development-plan.xml`
- `docs/verification-plan.xml`
- relevant source files and nearby tests

When operating on one module, prefer that module's plan entry, verification entry, and local tests over rereading the whole repository.

If the optional `grace` CLI is available, `grace module show M-XXX --path <project-root> --with verification` is a fast way to read the shared/public module and verification context, and `grace file show <path> --path <project-root> --contracts --blocks` is a fast way to inspect the local/private contracts and semantic blocks that need evidence.

### Step 2: Derive Verification Targets from Contracts and Flows
Read the module contracts, function contracts, and linked flows. Extract:

- success scenarios
- failure scenarios
- critical invariants
- side effects
- forbidden behaviors

Turn these into a verification matrix before writing or revising tests. Keep the matrix synced into `docs/verification-plan.xml`.

### Step 3: Design Observability
For each critical path, define the minimum telemetry needed to debug and verify it.

At a minimum:
- important logs must reference `[ModuleName][functionName][BLOCK_NAME]`
- each critical branch should be visible in the trace
- side effects should be logged at a high-signal level
- secrets, credentials, and sensitive payloads must be redacted or omitted

Prefer stable structured logs or stable key fields over prose-heavy log lines.

### Step 4: Build or Refresh `docs/verification-plan.xml`
Update the verification artifact so it becomes execution-ready.

For each relevant module, define or refresh:
- `V-M-xxx` verification entry
- target test files
- module-local verification commands
- success and failure scenarios
- required log markers and trace assertions
- wave-level and phase-level follow-up checks

Also refresh project-wide policy when needed:
- log format
- redaction rules
- deterministic-first policy
- module/wave/phase split

### Step 5: Choose Evidence Types Per Scenario
For each scenario, decide which evidence type to use:

- **Deterministic assertions** for stable outputs, return values, state transitions, and exact invariants
- **Trace assertions** for required execution paths, branch decisions, retries, and failure handling
- **Integration or smoke checks** for end-to-end viability
- **Semantic evaluation of traces** only when domain correctness cannot be expressed reliably with exact asserts alone

If an exact assert works, use it. Do not replace strong deterministic checks with fuzzy evaluation.

### Step 6: Implement AI-Friendly Tests and Evidence Hooks
Write tests and harnesses that:

1. execute the scenario
2. collect the relevant trace, logs, or telemetry
3. verify both:
   - outcome correctness
   - trajectory correctness

Typical trace checks:
- required block markers appeared
- forbidden block markers did not appear
- events occurred in the expected order
- retries stayed within allowed bounds
- failure mode matched the contract

Substantial test files may also use MODULE_CONTRACT, MODULE_MAP, semantic blocks, and CHANGE_SUMMARY if that makes them easier for future agents to navigate.

### Step 7: Use Semantic Verification Carefully
When strict equality is too weak or too brittle, use bounded semantic checks.

Allowed pattern:
- provide the evaluator with:
  - the contract
  - the scenario description
  - the observed trace or structured logs
  - an explicit rubric
- ask whether the evidence satisfies the contract and why

Disallowed pattern:
- asking a model to "judge if this feels correct"
- using raw hidden reasoning as evidence
- relying on unconstrained free-form log dumps without a rubric

### Step 8: Apply Verification Levels
Match the verification depth to the execution stage.

- **Module level**: worker-local typecheck, lint, unit tests, deterministic assertions, and local trace checks
- **Wave level**: integration checks only for the merged surfaces touched in the wave
- **Phase level**: full suite, broad traceability checks, and final confidence checks before marking the phase done

Do not require full-repository verification after every clean module if the wave and phase gates already cover that risk.

Make these levels explicit in `docs/verification-plan.xml` so execution packets can reuse them.

### Step 9: Failure Triage
When verification fails, produce a concise failure packet:

- contract or scenario that failed
- expected evidence
- observed evidence
- first divergent module/function/block
- suggested next action

Use this packet to drive `$grace-fix` or to hand off the issue to another agent without losing context.

If `docs/operational-packets.xml` exists, align the handoff to its canonical `FailurePacket` fields.

## Verification Rules
- Deterministic assertions first, semantic trace evaluation second
- Logs are evidence, not decoration
- Every important log should map back to a semantic block
- Do not log chain-of-thought or hidden reasoning
- Do not assert on unstable wording if stable fields are available
- Prefer high-signal traces over verbose noise
- Keep `docs/verification-plan.xml` synchronized with real test files and commands
- Prefer source-adjacent tests and narrow fakes over giant opaque harnesses
- If verification is weak, improve observability before adding more agents
- Prefer module-level checks during worker execution and reserve broader suites for wave or phase gates

## Deliverables
When using this skill, produce:

1. an updated `docs/verification-plan.xml`
2. a verification matrix for the scoped modules or flows
3. the telemetry/logging requirements
4. the tests or harness changes needed
5. the recommended verification level split across module, wave, and phase
6. a brief assessment of whether the module is safe for autonomous or multi-agent execution

## When to Use It
- Before a first serious `$grace-execute` or `$grace-multiagent-execute` run
- Before enabling autonomous execution for a module
- When multi-agent workflows need trustworthy checks
- When tests are too brittle or too shallow
- When bugs recur and logs are not actionable
- When business logic is hard to verify with plain equality asserts alone

## Common Rationalizations

Thoughts that mean STOP — you are about to ship verification that autonomous agents cannot trust.

| Rationalization | Reality |
|---|---|
| "This branch is critical but log markers slow things down, skip them" | A critical branch without a stable log marker is invisible to every future agent debugging a failure. The marker IS the trace anchor — skipping it turns trace assertions into guesses. |
| "After the refactor I'll just reuse the old log-marker names, they're close enough" | Reused marker names after a refactor silently redirect trace assertions to the wrong block. If the block moved or split, mint a new name and update every `V-M-xxx` and test reference in the same commit. |
| "Module-level tests cover everything, phase-level gates are bureaucracy" | Module-level tests cannot observe cross-module state, merged surfaces, or wave-to-wave regression. Without phase-level gates, cross-wave drift ships undetected. |
| "The tests read like good documentation, that's enough" | A test with no assertions is a doc comment that allocates memory. Trajectory or outcome must be asserted — otherwise the test passes forever, including when the code is deleted. |
| "Verification-plan entry is a bit thin but it's good enough for now" | "Good enough" verification is how autonomous runs produce silent failures. Either the plan names concrete tests, commands, log markers, and scenarios, or it is not ready for `$grace-execute`. |
| "Deterministic asserts are too strict, a semantic evaluator will be more flexible" | Flexible means "unfalsifiable". If an exact assertion is possible, use it. Semantic evaluation is the last resort, never the default. |
| "Logging the full reasoning trace makes debugging easier" | Logging chain-of-thought or hidden reasoning is forbidden — it leaks into evidence and corrupts the rubric. Log stable structured fields, not monologue. |

## Red Flags

Stop immediately if any of the below apply — your verification plan is unsafe for autonomous or multi-agent execution:

- A `V-M-xxx` entry references a test file or command that does not exist on disk.
- A critical branch has no `[Module][function][BLOCK_NAME]` log marker or no trace assertion covering it.
- A refactor renamed semantic blocks but the verification-plan still references the old marker names.
- Phase-level gates are missing entirely, and wave-level checks are doing phase-level work.
- Test files contain scenario names and setup code but no `expect(...)` / `assert` statements.
- The verification-plan says "see tests" instead of naming scenarios, commands, markers, and expected evidence.
- A semantic evaluation is used where an exact assertion would have worked.
- Logs in critical paths contain redaction-violating data (tokens, PII, credentials) or raw model reasoning.

## When NOT to Use

- The project has no `docs/development-plan.xml` or module contracts yet — run `$grace-plan` first; verification without contracts is guessing.
- You are fixing a single reproducible bug — use `$grace-fix` (which writes its own RED-GREEN test) rather than redesigning the whole verification plan.
- The codebase is a throwaway spike that will be deleted — verification-plan overhead is not justified.
- The user wants project health status, not evidence design — route to `$grace-status`.
- The change is outside GRACE governance (e.g. lockfile update, typo in a comment) — regular code review is enough.
- You are mid-execution in a wave and the caller needs a worker-local check only — use the module-level entry that already exists; do not rewrite the plan mid-wave.

## Verification

Before claiming this skill is complete, confirm every box:

- [ ] `docs/verification-plan.xml` updated and still well-formed (verification: open the file and confirm each touched `V-M-xxx` has targets, commands, scenarios, and markers)
- [ ] Every critical branch has a stable log marker (verification: `grep -rn "\[.*\]\[.*\]\[.*\]" src/` matches the markers named in the plan)
- [ ] Marker names in the plan exist in code AND match the block names (verification: for each marker `X`, `grep -rn "START_BLOCK_X" src/` returns exactly one match)
- [ ] Module-, wave-, and phase-level commands are explicit and runnable (verification: each listed command executes, e.g. `bun test <path>` returns a real exit code)
- [ ] Tests contain real assertions, not just scenario setup (verification: `grep -rEn "expect\(|assert(Equal|That|True|False)?\(" tests/` for each target test file)
- [ ] No chain-of-thought or sensitive payloads logged (verification: `grep -rnE "reasoning|thought|password|token|secret" src/` in logged strings returns no hits that escape redaction)
- [ ] Failure packet shape matches `docs/operational-packets.xml` when that file exists (verification: grep the packet fields against the canonical `FailurePacket`)
- [ ] `grace lint --path <project-root>` (if CLI available) passes after the plan update, and its exit code is cited in the deliverable
