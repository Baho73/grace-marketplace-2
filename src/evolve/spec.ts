// FILE: src/evolve/spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Read and validate a ProblemSpec from disk (JSON or minimal inline YAML-subset).
//   SCOPE: Parsing + validation only. No execution. Returns structured errors, never throws.
//   DEPENDS: node:fs, node:path, ./types
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-SPEC
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadSpec           - Read + validate spec from a path
//   validateSpec       - Validate an already-parsed object, return structured errors
//   SpecError          - Shape of a validation error: { code, message, path? }
//   LoadSpecResult     - Discriminated union: { ok: true, spec } | { ok: false, errors }
// END_MODULE_MAP

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MetricDirection, MetricSpec, ProblemSpec } from "./types";

export type SpecError = {
  code: string;
  message: string;
  path?: string;
};

export type LoadSpecResult =
  | { ok: true; spec: ProblemSpec; sourcePath: string }
  | { ok: false; errors: SpecError[] };

// START_CONTRACT: loadSpec
//   PURPOSE: Resolve a spec file on disk and return a validated ProblemSpec, or errors.
//   INPUTS: { specPath: string - path to spec.json or spec.yaml }
//   OUTPUTS: LoadSpecResult (ok | errors[])
//   SIDE_EFFECTS: Reads the file system.
// END_CONTRACT: loadSpec
export function loadSpec(specPath: string): LoadSpecResult {
  const abs = path.resolve(specPath);
  if (!existsSync(abs)) {
    return { ok: false, errors: [{ code: "spec.missing", message: `Spec not found at ${abs}` }] };
  }

  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: "spec.read-error",
          message: `Failed to read ${abs}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: "spec.parse-error",
          message: `Spec must be valid JSON. ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const result = validateSpec(parsed);
  if (!result.ok) {
    return result;
  }

  return { ok: true, spec: result.spec, sourcePath: abs };
}

// START_CONTRACT: validateSpec
//   PURPOSE: Validate an arbitrary object against the ProblemSpec shape.
//   INPUTS: { input: unknown - parsed JSON/YAML payload }
//   OUTPUTS: { ok: true, spec } | { ok: false, errors }
//   SIDE_EFFECTS: none
// END_CONTRACT: validateSpec
export function validateSpec(input: unknown):
  | { ok: true; spec: ProblemSpec }
  | { ok: false; errors: SpecError[] } {
  const errors: SpecError[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: [{ code: "spec.not-object", message: "Spec must be a JSON object." }] };
  }
  const record = input as Record<string, unknown>;

  // START_BLOCK_VALIDATE_TOP_LEVEL
  if (record.version !== 1) {
    errors.push({ code: "spec.bad-version", message: "`version` must be 1.", path: "version" });
  }
  if (typeof record.topic !== "string" || !record.topic.trim()) {
    errors.push({ code: "spec.bad-topic", message: "`topic` must be a non-empty string.", path: "topic" });
  }
  if (typeof record.goal !== "string" || !record.goal.trim()) {
    errors.push({ code: "spec.bad-goal", message: "`goal` must be a non-empty string.", path: "goal" });
  }
  // END_BLOCK_VALIDATE_TOP_LEVEL

  // START_BLOCK_VALIDATE_METRICS
  const metricsInput = record.metrics;
  const metrics: MetricSpec[] = [];
  if (!Array.isArray(metricsInput) || metricsInput.length === 0) {
    errors.push({
      code: "spec.no-metrics",
      message: "`metrics` must be a non-empty array (at least 2 recommended for Goodhart protection).",
      path: "metrics",
    });
  } else {
    metricsInput.forEach((candidateMetric, index) => {
      const metricErrors = validateMetric(candidateMetric, `metrics[${index}]`);
      errors.push(...metricErrors.errors);
      if (metricErrors.metric) {
        metrics.push(metricErrors.metric);
      }
    });

    const ids = new Set<string>();
    for (const metric of metrics) {
      if (ids.has(metric.id)) {
        errors.push({
          code: "spec.duplicate-metric-id",
          message: `Duplicate metric id "${metric.id}".`,
          path: `metrics.${metric.id}`,
        });
      }
      ids.add(metric.id);
    }
  }
  // END_BLOCK_VALIDATE_METRICS

  // START_BLOCK_VALIDATE_CANDIDATES
  const candidatesInput = record.candidates;
  const candidates: ProblemSpec["candidates"] = [];
  if (!Array.isArray(candidatesInput) || candidatesInput.length === 0) {
    errors.push({
      code: "spec.no-candidates",
      message: "`candidates` must be a non-empty array (MVP: at least 2 for a meaningful comparison).",
      path: "candidates",
    });
  } else {
    const seen = new Set<string>();
    candidatesInput.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push({
          code: "spec.bad-candidate",
          message: `candidates[${index}] must be an object.`,
          path: `candidates[${index}]`,
        });
        return;
      }
      const candidate = raw as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      if (!id) {
        errors.push({
          code: "spec.candidate-bad-id",
          message: `candidates[${index}].id must be a non-empty string.`,
          path: `candidates[${index}].id`,
        });
        return;
      }
      if (seen.has(id)) {
        errors.push({
          code: "spec.duplicate-candidate-id",
          message: `Duplicate candidate id "${id}".`,
          path: `candidates.${id}`,
        });
      }
      seen.add(id);

      const patch = typeof candidate.patch === "string" ? candidate.patch : undefined;
      const branch = typeof candidate.branch === "string" ? candidate.branch : undefined;
      const baseline = candidate.baseline === true;
      const sources = [patch, branch, baseline ? "baseline" : undefined].filter(Boolean).length;
      if (sources !== 1) {
        errors.push({
          code: "spec.candidate-ambiguous-source",
          message: `candidates.${id} must set exactly one of { patch, branch, baseline: true }.`,
          path: `candidates.${id}`,
        });
      }

      candidates.push({
        id,
        description: typeof candidate.description === "string" ? candidate.description : undefined,
        patch,
        branch,
        baseline: baseline || undefined,
      });
    });
  }
  // END_BLOCK_VALIDATE_CANDIDATES

  // START_BLOCK_VALIDATE_STOPPING
  const stoppingInput = record.stopping;
  const stopping: ProblemSpec["stopping"] = {};
  if (stoppingInput && typeof stoppingInput === "object" && !Array.isArray(stoppingInput)) {
    const stopRecord = stoppingInput as Record<string, unknown>;
    for (const key of ["maxCandidates", "maxSeconds", "targetScore", "earlyStopAfterNoImprovement"] as const) {
      const value = stopRecord[key];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push({
          code: "spec.bad-stopping-value",
          message: `stopping.${key} must be a non-negative finite number.`,
          path: `stopping.${key}`,
        });
        continue;
      }
      stopping[key] = value;
    }
  }
  // END_BLOCK_VALIDATE_STOPPING

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const spec: ProblemSpec = {
    version: 1,
    topic: String(record.topic).trim(),
    goal: String(record.goal).trim(),
    metrics,
    candidates,
    stopping,
    setup: typeof record.setup === "string" ? record.setup : undefined,
    teardown: typeof record.teardown === "string" ? record.teardown : undefined,
  };

  return { ok: true, spec };
}

function validateMetric(
  input: unknown,
  pathPrefix: string,
): { metric: MetricSpec | null; errors: SpecError[] } {
  const errors: SpecError[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    errors.push({ code: "spec.bad-metric", message: `${pathPrefix} must be an object.`, path: pathPrefix });
    return { metric: null, errors };
  }
  const metric = input as Record<string, unknown>;
  const id = typeof metric.id === "string" ? metric.id.trim() : "";
  if (!id) {
    errors.push({
      code: "spec.metric-bad-id",
      message: `${pathPrefix}.id must be a non-empty string.`,
      path: `${pathPrefix}.id`,
    });
  }
  const command = typeof metric.command === "string" ? metric.command.trim() : "";
  if (!command) {
    errors.push({
      code: "spec.metric-bad-command",
      message: `${pathPrefix}.command must be a non-empty string.`,
      path: `${pathPrefix}.command`,
    });
  }
  const direction = metric.direction;
  if (direction !== "higher-is-better" && direction !== "lower-is-better") {
    errors.push({
      code: "spec.metric-bad-direction",
      message: `${pathPrefix}.direction must be "higher-is-better" or "lower-is-better".`,
      path: `${pathPrefix}.direction`,
    });
  }
  const weight = metric.weight;
  if (weight !== undefined && (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0)) {
    errors.push({
      code: "spec.metric-bad-weight",
      message: `${pathPrefix}.weight must be a positive finite number.`,
      path: `${pathPrefix}.weight`,
    });
  }
  const veto = metric.veto;
  if (veto !== undefined && (typeof veto !== "number" || !Number.isFinite(veto))) {
    errors.push({
      code: "spec.metric-bad-veto",
      message: `${pathPrefix}.veto must be a finite number when set.`,
      path: `${pathPrefix}.veto`,
    });
  }
  if (errors.length > 0) {
    return { metric: null, errors };
  }
  return {
    metric: {
      id,
      description: typeof metric.description === "string" ? metric.description : undefined,
      command,
      parser: typeof metric.parser === "string" ? metric.parser : undefined,
      direction: direction as MetricDirection,
      weight: typeof weight === "number" ? weight : undefined,
      veto: typeof veto === "number" ? veto : undefined,
    },
    errors,
  };
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial spec loader + validator. JSON only for MVP; YAML parser is future work.
// END_CHANGE_SUMMARY
