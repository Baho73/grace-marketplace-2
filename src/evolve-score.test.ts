import { describe, expect, it } from "bun:test";

import { hasVeto, normalizeMetric, scoreTrials } from "./evolve/score";
import type { MetricResult, MetricSpec } from "./evolve/types";

function metricResult(
  metricId: string,
  value: number | null,
  overrides: Partial<MetricResult> = {},
): MetricResult {
  return {
    metricId,
    command: `echo ${value ?? ""}`,
    rawStdout: value === null ? "" : String(value),
    value,
    parseError: null,
    durationMs: 1,
    exitCode: 0,
    ...overrides,
  };
}

describe("normalizeMetric", () => {
  it("maps the midpoint to ~0.5 for higher-is-better", () => {
    expect(normalizeMetric(50, 0, 100, "higher-is-better")).toBeCloseTo(0.5, 10);
    expect(normalizeMetric(0, 0, 100, "higher-is-better")).toBe(0);
    expect(normalizeMetric(100, 0, 100, "higher-is-better")).toBe(1);
  });

  it("inverts the mapping for lower-is-better", () => {
    expect(normalizeMetric(0, 0, 100, "lower-is-better")).toBe(1);
    expect(normalizeMetric(100, 0, 100, "lower-is-better")).toBe(0);
    expect(normalizeMetric(25, 0, 100, "lower-is-better")).toBeCloseTo(0.75, 10);
  });

  it("returns 1 when min equals max (degenerate cohort)", () => {
    expect(normalizeMetric(42, 42, 42, "higher-is-better")).toBe(1);
    expect(normalizeMetric(42, 42, 42, "lower-is-better")).toBe(1);
  });

  it("returns 0 for non-finite input", () => {
    expect(normalizeMetric(Number.NaN, 0, 100, "higher-is-better")).toBe(0);
    expect(normalizeMetric(Number.POSITIVE_INFINITY, 0, 100, "higher-is-better")).toBe(0);
  });
});

describe("hasVeto", () => {
  it("returns false when no metric defines a veto", () => {
    const specs: MetricSpec[] = [
      { id: "a", command: "echo 1", direction: "higher-is-better" },
      { id: "b", command: "echo 2", direction: "lower-is-better" },
    ];
    const metrics = [metricResult("a", 10), metricResult("b", 5)];
    const result = hasVeto(metrics, specs);
    expect(result.vetoed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("returns true when a value is worse than the veto (higher-is-better)", () => {
    const specs: MetricSpec[] = [
      { id: "accuracy", command: "echo", direction: "higher-is-better", veto: 0.8 },
    ];
    const metrics = [metricResult("accuracy", 0.5)];
    const result = hasVeto(metrics, specs);
    expect(result.vetoed).toBe(true);
    expect(result.reason).toContain("accuracy");
    expect(result.reason).toContain("0.8");
  });

  it("returns true when a value is worse than the veto (lower-is-better)", () => {
    const specs: MetricSpec[] = [
      { id: "latency", command: "echo", direction: "lower-is-better", veto: 100 },
    ];
    const metrics = [metricResult("latency", 250)];
    const result = hasVeto(metrics, specs);
    expect(result.vetoed).toBe(true);
    expect(result.reason).toContain("latency");
  });

  it("returns false when the value is better than or equal to the veto", () => {
    const specs: MetricSpec[] = [
      { id: "accuracy", command: "echo", direction: "higher-is-better", veto: 0.8 },
      { id: "latency", command: "echo", direction: "lower-is-better", veto: 100 },
    ];
    const metrics = [metricResult("accuracy", 0.9), metricResult("latency", 75)];
    const result = hasVeto(metrics, specs);
    expect(result.vetoed).toBe(false);
    expect(result.reason).toBeNull();
  });
});

describe("scoreTrials", () => {
  it("computes weighted normalized scores for two trials with all metrics filled", () => {
    const specs: MetricSpec[] = [
      { id: "acc", command: "echo", direction: "higher-is-better" },
      { id: "lat", command: "echo", direction: "lower-is-better" },
    ];
    const trials = [
      { candidateId: "a", metrics: [metricResult("acc", 0.9), metricResult("lat", 100)] },
      { candidateId: "b", metrics: [metricResult("acc", 0.7), metricResult("lat", 50)] },
    ];
    const scores = scoreTrials(trials, specs);

    // a: acc normalized = 1 (max), lat normalized = 0 (worst) -> 0.5
    // b: acc normalized = 0 (min), lat normalized = 1 (best) -> 0.5
    expect(scores.get("a")).toBeCloseTo(0.5, 10);
    expect(scores.get("b")).toBeCloseTo(0.5, 10);
  });

  it("returns null score for trials with a missing metric value", () => {
    const specs: MetricSpec[] = [
      { id: "acc", command: "echo", direction: "higher-is-better" },
      { id: "lat", command: "echo", direction: "lower-is-better" },
    ];
    const trials = [
      { candidateId: "ok", metrics: [metricResult("acc", 0.9), metricResult("lat", 50)] },
      { candidateId: "broken", metrics: [metricResult("acc", null), metricResult("lat", 100)] },
    ];
    const scores = scoreTrials(trials, specs);
    expect(scores.get("ok")).not.toBeNull();
    expect(scores.get("broken")).toBeNull();
  });

  it("applies metric weights when combining scores", () => {
    const heavy: MetricSpec[] = [
      { id: "acc", command: "echo", direction: "higher-is-better", weight: 9 },
      { id: "lat", command: "echo", direction: "lower-is-better", weight: 1 },
    ];
    const equal: MetricSpec[] = [
      { id: "acc", command: "echo", direction: "higher-is-better", weight: 1 },
      { id: "lat", command: "echo", direction: "lower-is-better", weight: 1 },
    ];
    const trials = [
      { candidateId: "a", metrics: [metricResult("acc", 1), metricResult("lat", 100)] },
      { candidateId: "b", metrics: [metricResult("acc", 0), metricResult("lat", 50)] },
    ];

    const heavyScores = scoreTrials(trials, heavy);
    const equalScores = scoreTrials(trials, equal);

    // With heavy weight on accuracy, "a" (perfect accuracy, worst latency) should dominate.
    expect(heavyScores.get("a")).toBeGreaterThan(heavyScores.get("b") ?? -Infinity);

    // With equal weights, both balance out at 0.5.
    expect(equalScores.get("a")).toBeCloseTo(0.5, 10);
    expect(equalScores.get("b")).toBeCloseTo(0.5, 10);

    // Heavy score for "a" should exceed its equal-weighted score.
    expect(heavyScores.get("a") ?? 0).toBeGreaterThan(equalScores.get("a") ?? 0);
  });
});
