// FILE: src/evolve/score.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Compute a single weighted score from multiple metric results with direction awareness + veto enforcement.
//   SCOPE: Pure math. No side effects. Normalization is min-max across all trials for a given metric.
//   DEPENDS: ./types
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-SCORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   normalizeMetric   - Normalize a raw value to [0, 1] given direction and cohort min/max
//   scoreTrials       - Compute score per trial given the metric specs and all trial metric results
//   hasVeto           - True if any metric value is worse than its veto threshold
// END_MODULE_MAP

import type { MetricResult, MetricSpec } from "./types";

// START_CONTRACT: normalizeMetric
//   PURPOSE: Map a raw metric value to [0, 1] where 1 is best. Handles degenerate cohorts.
//   INPUTS: { value: number, min: number, max: number, direction: MetricDirection }
//   OUTPUTS: number in [0, 1]
//   SIDE_EFFECTS: none
// END_CONTRACT: normalizeMetric
export function normalizeMetric(
  value: number,
  min: number,
  max: number,
  direction: "higher-is-better" | "lower-is-better",
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (max === min) {
    return 1;
  }
  const raw = (value - min) / (max - min);
  return direction === "higher-is-better" ? raw : 1 - raw;
}

// START_CONTRACT: hasVeto
//   PURPOSE: Return true if any metric value is worse than its veto threshold.
//   INPUTS: { metrics: MetricResult[], specs: MetricSpec[] }
//   OUTPUTS: boolean
//   SIDE_EFFECTS: none
// END_CONTRACT: hasVeto
export function hasVeto(metrics: MetricResult[], specs: MetricSpec[]): { vetoed: boolean; reason: string | null } {
  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  for (const result of metrics) {
    const spec = specById.get(result.metricId);
    if (!spec || spec.veto === undefined || result.value === null) {
      continue;
    }
    const worseThanVeto =
      spec.direction === "higher-is-better" ? result.value < spec.veto : result.value > spec.veto;
    if (worseThanVeto) {
      return {
        vetoed: true,
        reason: `Metric ${spec.id}=${result.value} crosses veto threshold ${spec.veto} (${spec.direction}).`,
      };
    }
  }
  return { vetoed: false, reason: null };
}

// START_CONTRACT: scoreTrials
//   PURPOSE: Compute per-trial weighted score based on all trials in the cohort.
//   INPUTS: { trials: { candidateId, metrics: MetricResult[] }[], specs: MetricSpec[] }
//   OUTPUTS: Map<candidateId, score | null>
//   SIDE_EFFECTS: none
// END_CONTRACT: scoreTrials
export function scoreTrials(
  trials: { candidateId: string; metrics: MetricResult[] }[],
  specs: MetricSpec[],
): Map<string, number | null> {
  const scores = new Map<string, number | null>();

  // START_BLOCK_COLLECT_COHORT_RANGES
  const cohort = new Map<string, number[]>();
  for (const spec of specs) {
    cohort.set(spec.id, []);
  }
  for (const trial of trials) {
    for (const result of trial.metrics) {
      if (result.value === null || !Number.isFinite(result.value)) {
        continue;
      }
      const bucket = cohort.get(result.metricId);
      if (bucket) {
        bucket.push(result.value);
      }
    }
  }
  const ranges = new Map<string, { min: number; max: number }>();
  for (const [id, values] of cohort) {
    if (values.length === 0) {
      continue;
    }
    ranges.set(id, { min: Math.min(...values), max: Math.max(...values) });
  }
  // END_BLOCK_COLLECT_COHORT_RANGES

  // START_BLOCK_SCORE_EACH_TRIAL
  const totalWeight = specs.reduce((sum, spec) => sum + (spec.weight ?? 1), 0) || 1;
  for (const trial of trials) {
    let weighted = 0;
    let missing = false;
    for (const spec of specs) {
      const result = trial.metrics.find((item) => item.metricId === spec.id);
      if (!result || result.value === null) {
        missing = true;
        break;
      }
      const range = ranges.get(spec.id);
      if (!range) {
        missing = true;
        break;
      }
      const normalized = normalizeMetric(result.value, range.min, range.max, spec.direction);
      weighted += normalized * (spec.weight ?? 1);
    }
    scores.set(trial.candidateId, missing ? null : weighted / totalWeight);
  }
  // END_BLOCK_SCORE_EACH_TRIAL

  return scores;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Min-max normalization; veto check; weighted sum.
// END_CHANGE_SUMMARY
