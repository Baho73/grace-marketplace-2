---
name: grace-evolve
description: "Evolutionary / comparative search over candidate solutions. Use when facing a design or implementation choice with multiple plausible approaches, clear measurable metrics, and enough budget to run them in isolation. MVP: user-authored candidates + metric runner + archive. Future: LLM-critic loop that generates new candidates from prior results."
---

Run a comparative experiment: N candidates, each scored by user-declared metrics, each executed in an isolated git worktree, winner archived with full trace.

## Prerequisites

- Project under git (worktree isolation requires it).
- `@osovv/grace-cli` installed (the `grace` binary on PATH).
- A spec file at `docs/experiments/<topic>/spec.json`. Generate one with `grace evolve init <topic>`.
- For every metric: a command that prints a number to stdout, and a direction (`higher-is-better` / `lower-is-better`).
- For every candidate: exactly one source of truth — `baseline: true`, a `branch` name, or a `patch` path.

If the comparison lacks measurable metrics (pure taste / UX / "feels better") — this skill does not apply. Write a short ADR instead.

## Command Surface (CLI)

| Command | Purpose |
|---|---|
| `grace evolve init <topic>` | Scaffold `docs/experiments/<topic>/spec.json` with a starter template |
| `grace evolve run <topic>` | Execute the loop; writes `docs/experiments/<topic>/results.xml` |
| `grace evolve show <topic>` | Print the latest archive for that topic |

Exit codes:
- `0` — completed (archive written, winner may still be null if every candidate failed)
- `2` — bad args (topic/spec mismatch, init target exists)
- `47` — spec invalid (validation errors printed)
- `48` — orchestrator threw unexpectedly

## Spec Shape

`spec.json` at the topic directory:

```json
{
  "version": 1,
  "topic": "reduce-bundle-size",
  "goal": "Cut production bundle below 200 KB without losing Lighthouse performance score",
  "metrics": [
    {
      "id": "bundle-kb",
      "description": "Minified bundle size in KB",
      "command": "bun run build && stat -c '%s' dist/main.js | awk '{print $1/1024}'",
      "direction": "lower-is-better",
      "weight": 1,
      "veto": 500
    },
    {
      "id": "lhouse-perf",
      "description": "Lighthouse performance score [0..100]",
      "command": "bun run lhci --quiet | awk '/performance/ {print $2}'",
      "direction": "higher-is-better",
      "weight": 2,
      "veto": 80
    }
  ],
  "candidates": [
    { "id": "baseline", "baseline": true, "description": "Unmodified HEAD" },
    { "id": "tree-shake-aggressive", "branch": "evolve/tree-shake-aggressive" },
    { "id": "code-split-routes", "patch": "experiments/patches/code-split-routes.patch" }
  ],
  "stopping": {
    "maxCandidates": 8,
    "maxSeconds": 3600,
    "targetScore": 0.95,
    "earlyStopAfterNoImprovement": 3
  },
  "setup": "bun install",
  "teardown": "rm -rf node_modules/.vite"
}
```

**Anti-Goodhart requirement:** declare **≥2 metrics** with different directions or dimensions. A single-metric search is exactly what optimizes "hack the metric, not the goal".

## Process

### Step 1 — Frame the choice

Before touching the CLI, articulate:

- The **decision** in one sentence. "Which bundler strategy minimizes size while keeping perf?"
- The **metrics** that would make the answer objective. If you can't state ≥2, stop here — use `grace-plan` instead.
- The **candidates** (3-8 for MVP). Each must be a concrete diff: a branch tip, a patch file, or the baseline.
- The **stopping criteria**: budget (candidates / seconds), target score, or convergence.

Write these into `docs/experiments/<topic>/spec.json` using `grace evolve init <topic>` as a starting template. Edit the template — do not ship the example metrics.

### Step 2 — Validate the spec

```
grace evolve run <topic>
```

If the spec is invalid, exit 47 prints the errors. Fix them before spending any budget.

Dry-run guard: if you are inside a `grace-afk` session, run `grace afk tick` first. Any evolve run that exceeds the afk session's remaining budget must NOT start — stop or stage the candidates for the next session.

### Step 3 — Execute

The orchestrator, for each candidate:

1. `git worktree add <tmpdir> <ref>` (or `HEAD` + `git apply <patch>` for patch candidates)
2. Run `spec.setup` if present
3. Run every metric command, capture stdout, parse numeric value using `spec.metric.parser` (default: last numeric-only line)
4. Run `spec.teardown` if present
5. `git worktree remove --force <tmpdir>` (and delete any temp branch)

A candidate that fails any metric is marked `verdict: "failed"` and does not score. A candidate that crosses any `veto` threshold is marked `verdict: "vetoed"`.

The CLI streams progress line by line:

```
[start] evolve started with 3 candidate(s), topic=reduce-bundle-size
[candidate-started] running baseline
[candidate-finished] baseline verdict=advance score=0.4231
[candidate-started] running tree-shake-aggressive
...
[archived] archive written to docs/experiments/reduce-bundle-size/results.xml
```

### Step 4 — Read the archive

`grace evolve show <topic>` prints `results.xml`. The structure:

```xml
<EvolveArchive VERSION="1">
  <Topic>...</Topic>
  <Goal>...</Goal>
  <StartedAt>...</StartedAt>
  <FinishedAt>...</FinishedAt>
  <StoppedBy>exhausted | budget | target | convergence</StoppedBy>
  <Winner>candidate-id</Winner>
  <Metrics>
    <M-bundle-kb DIRECTION="lower-is-better" WEIGHT="1" VETO="500">...</M-bundle-kb>
    ...
  </Metrics>
  <Trials>
    <T-baseline VERDICT="advance" SCORE="0.4231">
      <StartedAt>...</StartedAt>
      <FinishedAt>...</FinishedAt>
      <Worktree>/tmp/.../cand-baseline</Worktree>
      <Metrics>
        <m-bundle-kb VALUE="342.5" EXIT="0" DURATION_MS="12310" />
        <m-lhouse-perf VALUE="88" EXIT="0" DURATION_MS="47030" />
      </Metrics>
    </T-baseline>
    ...
  </Trials>
</EvolveArchive>
```

### Step 5 — Apply the winner

Winning does not mean shipping. Before merging:

1. Human review of the diff (`git log <winner-branch>` or the patch).
2. Re-run full project tests on main, not in the worktree (`bun test`).
3. If the winner is a patch, recreate it as a proper feature branch + commits + PR. Evolve output is evidence, not the final artifact.
4. If `verdict=failed` or `verdict=vetoed` for every candidate, the experiment did not find a winner — escalate to `$grace-plan` to reframe the problem.

## Anti-Goodhart rules

| Rule | Why |
|---|---|
| **≥2 metrics with orthogonal dimensions** | Single-metric searches optimize the metric, not the goal. Pair size with quality, speed with correctness, cost with latency. |
| **Veto thresholds on safety metrics** | If a metric is a floor (tests must pass, errors must stay below X), set `veto`. A trial that crosses veto is disqualified regardless of score. |
| **Weighted sum after normalization** | Raw values are incomparable (KB vs percent). Every metric is normalized to `[0, 1]` across the cohort, then weighted. |
| **The winner is a proposal, not a commit** | Evolve ships the archive. Humans ship the merge. Never auto-merge evolve output into main. |
| **Candidate diversity over parameter sweeping** | Evolve is designed for structurally different approaches (algorithm A vs B), not for tuning a single knob. If you're sweeping parameters, use a regular search tool. |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "One metric is enough, the goal is obvious" | Goodhart exists for a reason. Always pair at least two metrics; the second is the floor under the first. |
| "I'll parse the metric output later" | Every metric must parse *now*. A metric you cannot read automatically is not a metric; it is a vibe. |
| "This will converge quickly, no stopping criteria needed" | Without `maxCandidates` / `maxSeconds` the loop can eat the whole /afk budget on the first diverging run. Always set at least one cap. |
| "Baseline is the same as doing nothing, skip it" | The baseline is the reference point that makes every other candidate interpretable. Always include a baseline trial. |
| "My candidate is a 400-line diff, I'll inline it" | Patches belong in files. Keep them under `experiments/<topic>/patches/*.patch` so the spec is readable and the diff is reviewable. |
| "The winner tested green, so merge it" | Winner = best in cohort. Still needs human review and main-branch test pass before merge. Evolve is an accelerator, not a rubber stamp. |
| "I'll run evolve without git — the project isn't versioned" | Worktrees require git. If the project is not git-tracked, use `grace-plan` + manual A/B comparison. |

## Red Flags

- You declared a single metric with `weight: 1` and no `veto` — missing Goodhart protection.
- Your metric command prints prose like "Bundle size: 342 KB" — you will hit parser errors. Emit a number on its own line.
- You are running evolve inside `grace-afk` and the per-candidate command takes minutes while `maxCandidates` is 20 — budget will blow before convergence.
- You are using `patch` candidates but the patches have never been applied before — validate each patch with `git apply --check` manually first.
- You are evaluating in the base repo, not a worktree — means you skipped isolation (do not do this; the CLI prevents it).
- The archive's winner has `score=null` (i.e. every candidate was vetoed or failed) — do NOT claim a result. The experiment did not converge.

## When NOT to Use

- The decision is subjective / taste-based (UI polish, naming, story arcs). Evolve quantifies; if your question doesn't, you are measuring the wrong thing.
- The project is not under git. Worktree isolation is mandatory.
- You have only one candidate. Evolve requires a cohort — write a spike branch and measure it directly.
- Each candidate takes hours to evaluate and you have <1 hour. Either stage the run under `/afk 8+` or defer.
- You are tuning a single numeric knob across a range. Use a regular hyperparameter tool; evolve is for structurally different approaches.

## Integration with `grace-afk`

`grace-evolve` is one of the autonomy-matrix branches in a `grace-afk` session:

- When `grace-afk` classifies a step as **uncertain** with ≥2 plausible approaches, it should call `grace evolve init` + `grace evolve run` to pick one instead of deferring to `deferred.md`.
- The evolve archive becomes evidence in the AFK session's `decisions.md`: one entry per candidate, plus one entry for the winner choice with `class: one-way-door-escalated` if the winner affects public surface (contract change, migration, data schema).
- Evolve respects the AFK session budget via `--timeout` on individual commands; the orchestrator does NOT itself poll `grace afk tick`, so the agent must verify the remaining afk budget before calling `grace evolve run`.

## Verification

Before exiting this skill, confirm:

- [ ] `spec.json` has ≥2 metrics and ≥2 candidates (one of which is a baseline)
- [ ] Every metric command prints a number parseable by its `parser` (verify with `bash -c "<command>"` first)
- [ ] At least one `stopping` field is set (avoids infinite runs)
- [ ] `grace evolve run <topic>` exited 0
- [ ] `docs/experiments/<topic>/results.xml` exists and contains every candidate under `<Trials>`
- [ ] `<Winner>` is either a candidate id or the archive documents why every trial failed/was vetoed
- [ ] If the winner is applied to the codebase — a human-reviewable PR exists; evolve archive is cited in the PR body as evidence

## Roadmap (future sessions)

- **LLM-critic loop**: after the initial cohort, feed the top-K archives to a critic that generates new candidate patches and re-runs. This is the "evolutionary" part and is intentionally deferred.
- **Parallel candidate execution**: run N worktrees concurrently under a configurable worker pool.
- **YAML spec** support (MVP is JSON only).
- **Budget enforcement at the CLI level** (track token / time caps across a session, mirror the `grace-afk` tick pattern).
