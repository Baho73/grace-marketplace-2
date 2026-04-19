// FILE: src/evolve/runner.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Run one candidate in isolation: prepare worktree, apply patch/branch, execute metric commands, collect results.
//   SCOPE: A single candidate lifecycle. No orchestration across candidates. No archive writing.
//   DEPENDS: node:child_process, node:fs, node:path, ./types, ./metric
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-RUNNER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   runCandidate     - Prepare, execute, teardown; return a TrialResult
//   RunnerDeps       - Injectable dependencies for tests (exec, fs)
//   Exec             - Function shape for candidate command execution (injectable)
//   ExecResult       - Return shape of an Exec invocation
//   makeDefaultDeps  - Real fs + real spawnSync
// END_MODULE_MAP

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { parseMetricOutput } from "./metric";
import type { Candidate, MetricResult, ProblemSpec, TrialResult } from "./types";

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type Exec = (command: string, cwd: string, timeoutMs?: number) => ExecResult;

export type RunnerDeps = {
  exec: Exec;
  now: () => Date;
};

// START_CONTRACT: makeDefaultDeps
//   PURPOSE: Produce a RunnerDeps backed by child_process.spawnSync and the real clock.
//   INPUTS: none
//   OUTPUTS: RunnerDeps
//   SIDE_EFFECTS: none (dep factory; actual I/O happens when deps are called)
// END_CONTRACT: makeDefaultDeps
export function makeDefaultDeps(): RunnerDeps {
  return {
    now: () => new Date(),
    exec: (command, cwd, timeoutMs) => {
      const start = Date.now();
      const result = spawnSync(command, {
        cwd,
        shell: true,
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? -1,
        durationMs: Date.now() - start,
      };
    },
  };
}

// START_CONTRACT: runCandidate
//   PURPOSE: Execute a single candidate end-to-end and produce a TrialResult.
//   INPUTS: { candidate, spec, worktreePath, deps }
//   OUTPUTS: TrialResult
//   SIDE_EFFECTS: Invokes setup/metric/teardown commands in the worktree. No writes outside the worktree unless user commands do so.
// END_CONTRACT: runCandidate
export function runCandidate(args: {
  candidate: Candidate;
  spec: ProblemSpec;
  worktreePath: string;
  deps: RunnerDeps;
  perCommandTimeoutMs?: number;
}): TrialResult {
  const { candidate, spec, worktreePath, deps, perCommandTimeoutMs } = args;
  const startedAt = deps.now().toISOString();

  if (!existsSync(worktreePath)) {
    return {
      candidateId: candidate.id,
      startedAt,
      finishedAt: deps.now().toISOString(),
      metrics: [],
      score: null,
      verdict: "failed",
      reason: `Worktree path does not exist: ${worktreePath}`,
      worktreePath,
    };
  }

  // START_BLOCK_RUN_SETUP
  if (spec.setup) {
    const setupResult = deps.exec(spec.setup, worktreePath, perCommandTimeoutMs);
    if (setupResult.exitCode !== 0) {
      return {
        candidateId: candidate.id,
        startedAt,
        finishedAt: deps.now().toISOString(),
        metrics: [],
        score: null,
        verdict: "failed",
        reason: `setup failed (exit ${setupResult.exitCode}): ${setupResult.stderr.slice(0, 400)}`,
        worktreePath,
      };
    }
  }
  // END_BLOCK_RUN_SETUP

  // START_BLOCK_RUN_METRICS
  const metrics: MetricResult[] = [];
  for (const metricSpec of spec.metrics) {
    const execResult = deps.exec(metricSpec.command, worktreePath, perCommandTimeoutMs);
    if (execResult.exitCode !== 0) {
      metrics.push({
        metricId: metricSpec.id,
        command: metricSpec.command,
        rawStdout: execResult.stdout,
        value: null,
        parseError: `exit ${execResult.exitCode}: ${execResult.stderr.slice(0, 200)}`,
        durationMs: execResult.durationMs,
        exitCode: execResult.exitCode,
      });
      continue;
    }
    const parsed = parseMetricOutput(execResult.stdout, metricSpec.parser);
    metrics.push({
      metricId: metricSpec.id,
      command: metricSpec.command,
      rawStdout: execResult.stdout,
      value: parsed.value,
      parseError: parsed.error,
      durationMs: execResult.durationMs,
      exitCode: execResult.exitCode,
    });
  }
  // END_BLOCK_RUN_METRICS

  // START_BLOCK_RUN_TEARDOWN
  if (spec.teardown) {
    deps.exec(spec.teardown, worktreePath, perCommandTimeoutMs);
  }
  // END_BLOCK_RUN_TEARDOWN

  // START_BLOCK_VERDICT
  const anyFailed = metrics.some((metric) => metric.value === null);
  const verdict: TrialResult["verdict"] = anyFailed ? "failed" : "advance";
  const reason = anyFailed ? firstMetricError(metrics) : null;
  // END_BLOCK_VERDICT

  return {
    candidateId: candidate.id,
    startedAt,
    finishedAt: deps.now().toISOString(),
    metrics,
    score: null, // filled in by the orchestrator across the cohort
    verdict,
    reason,
    worktreePath,
  };
}

function firstMetricError(metrics: MetricResult[]): string | null {
  for (const metric of metrics) {
    if (metric.value === null) {
      return `metric ${metric.metricId} did not yield a value: ${metric.parseError ?? "unknown"}`;
    }
  }
  return null;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Candidate lifecycle with injectable exec + clock.
// END_CHANGE_SUMMARY
