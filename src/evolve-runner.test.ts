import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { runCandidate, type ExecResult, type RunnerDeps } from "./evolve/runner";
import type { Candidate, ProblemSpec } from "./evolve/types";

function tmpWorktree() {
  return mkdtempSync(path.join(os.tmpdir(), "grace-evolve-runner-"));
}

type ExecCall = { command: string; cwd: string; timeoutMs?: number };

type ExecRule = (call: ExecCall) => ExecResult;

type MockDeps = RunnerDeps & {
  journal: ExecCall[];
};

function makeMockDeps(options: {
  responses: Record<string, ExecResult>;
  fallback?: ExecRule;
  nowIso?: string;
}): MockDeps {
  const journal: ExecCall[] = [];
  const now = new Date(options.nowIso ?? "2026-04-18T10:00:00.000Z");
  const deps: MockDeps = {
    journal,
    now: () => now,
    exec: (command, cwd, timeoutMs) => {
      const call: ExecCall = { command, cwd, timeoutMs };
      journal.push(call);
      const hit = options.responses[command];
      if (hit) {
        return hit;
      }
      if (options.fallback) {
        return options.fallback(call);
      }
      return { stdout: "", stderr: "unexpected command: " + command, exitCode: 1, durationMs: 0 };
    },
  };
  return deps;
}

function execOk(stdout: string, durationMs = 5): ExecResult {
  return { stdout, stderr: "", exitCode: 0, durationMs };
}

function execFail(stderr: string, exitCode = 1, durationMs = 5): ExecResult {
  return { stdout: "", stderr, exitCode, durationMs };
}

function sampleSpec(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
  return {
    version: 1,
    topic: "demo",
    goal: "improve",
    metrics: [
      { id: "acc", command: "run-acc", direction: "higher-is-better" },
      { id: "lat", command: "run-lat", direction: "lower-is-better" },
    ],
    candidates: [{ id: "a", baseline: true }],
    stopping: {},
    ...overrides,
  };
}

const baselineCandidate: Candidate = { id: "cand-a", baseline: true };

describe("runCandidate", () => {
  it("returns advance verdict when all metrics succeed", () => {
    const worktree = tmpWorktree();
    const deps = makeMockDeps({
      responses: {
        "run-acc": execOk("0.95\n"),
        "run-lat": execOk("120\n"),
      },
    });

    const trial = runCandidate({
      candidate: baselineCandidate,
      spec: sampleSpec(),
      worktreePath: worktree,
      deps,
    });

    expect(trial.verdict).toBe("advance");
    expect(trial.reason).toBeNull();
    expect(trial.metrics.length).toBe(2);
    expect(trial.metrics[0]?.metricId).toBe("acc");
    expect(trial.metrics[0]?.value).toBe(0.95);
    expect(trial.metrics[1]?.metricId).toBe("lat");
    expect(trial.metrics[1]?.value).toBe(120);
    expect(trial.worktreePath).toBe(worktree);
    expect(trial.startedAt).toBe("2026-04-18T10:00:00.000Z");
    expect(trial.finishedAt).toBe("2026-04-18T10:00:00.000Z");
  });

  it("marks verdict=failed with parseError when a metric command exits non-zero", () => {
    const worktree = tmpWorktree();
    const deps = makeMockDeps({
      responses: {
        "run-acc": execFail("boom", 2),
        "run-lat": execOk("120\n"),
      },
    });

    const trial = runCandidate({
      candidate: baselineCandidate,
      spec: sampleSpec(),
      worktreePath: worktree,
      deps,
    });

    expect(trial.verdict).toBe("failed");
    expect(trial.reason).toContain("acc");
    const failed = trial.metrics.find((m) => m.metricId === "acc");
    expect(failed?.value).toBeNull();
    expect(failed?.exitCode).toBe(2);
    expect(failed?.parseError).toContain("exit 2");
    expect(failed?.parseError).toContain("boom");
  });

  it("fails fast with a 'setup failed' reason when setup exits non-zero", () => {
    const worktree = tmpWorktree();
    const deps = makeMockDeps({
      responses: {
        "prepare.sh": execFail("install failed", 3),
      },
    });

    const trial = runCandidate({
      candidate: baselineCandidate,
      spec: sampleSpec({ setup: "prepare.sh" }),
      worktreePath: worktree,
      deps,
    });

    expect(trial.verdict).toBe("failed");
    expect(trial.reason).toContain("setup failed");
    expect(trial.reason).toContain("install failed");
    expect(trial.metrics).toEqual([]);
    // Metric commands must not be invoked once setup fails.
    expect(deps.journal.map((c) => c.command)).toEqual(["prepare.sh"]);
  });

  it("returns failed when the worktree path does not exist", () => {
    const missing = path.join(os.tmpdir(), "grace-evolve-runner-does-not-exist-xyz-123");
    const deps = makeMockDeps({ responses: {} });

    const trial = runCandidate({
      candidate: baselineCandidate,
      spec: sampleSpec(),
      worktreePath: missing,
      deps,
    });

    expect(trial.verdict).toBe("failed");
    expect(trial.reason).toContain("Worktree path does not exist");
    expect(trial.metrics).toEqual([]);
    // No commands should be executed when the worktree is missing.
    expect(deps.journal.length).toBe(0);
  });

  it("invokes teardown after all metrics have been collected", () => {
    const worktree = tmpWorktree();
    const deps = makeMockDeps({
      responses: {
        "setup.sh": execOk(""),
        "run-acc": execOk("0.9\n"),
        "run-lat": execOk("80\n"),
        "teardown.sh": execOk(""),
      },
    });

    const trial = runCandidate({
      candidate: baselineCandidate,
      spec: sampleSpec({ setup: "setup.sh", teardown: "teardown.sh" }),
      worktreePath: worktree,
      deps,
    });

    expect(trial.verdict).toBe("advance");
    const order = deps.journal.map((c) => c.command);
    expect(order).toEqual(["setup.sh", "run-acc", "run-lat", "teardown.sh"]);
    // Every command must be executed inside the worktree.
    for (const call of deps.journal) {
      expect(call.cwd).toBe(worktree);
    }
  });
});
