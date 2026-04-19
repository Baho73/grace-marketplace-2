import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { loadSpec, validateSpec } from "./evolve/spec";

function tmpProject() {
  return mkdtempSync(path.join(os.tmpdir(), "grace-evolve-spec-"));
}

function validMinimalSpec() {
  return {
    version: 1,
    topic: "demo",
    goal: "improve throughput",
    metrics: [
      { id: "latency", command: "echo 10", direction: "lower-is-better" },
      { id: "accuracy", command: "echo 0.9", direction: "higher-is-better" },
    ],
    candidates: [
      { id: "a", baseline: true },
      { id: "b", patch: "patches/b.patch" },
    ],
  };
}

describe("validateSpec", () => {
  it("rejects a non-object input", () => {
    const result = validateSpec(42);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("spec.not-object");
    }

    const arrayResult = validateSpec([]);
    expect(arrayResult.ok).toBe(false);
    if (!arrayResult.ok) {
      expect(arrayResult.errors[0]?.code).toBe("spec.not-object");
    }

    const nullResult = validateSpec(null);
    expect(nullResult.ok).toBe(false);
  });

  it("collects multiple errors when top-level fields are missing", () => {
    const result = validateSpec({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("spec.bad-version");
      expect(codes).toContain("spec.bad-topic");
      expect(codes).toContain("spec.bad-goal");
      expect(codes).toContain("spec.no-metrics");
      expect(codes).toContain("spec.no-candidates");
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("flags duplicate metric ids", () => {
    const spec = validMinimalSpec();
    spec.metrics = [
      { id: "same", command: "echo 1", direction: "higher-is-better" },
      { id: "same", command: "echo 2", direction: "higher-is-better" },
    ];
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("spec.duplicate-metric-id");
    }
  });

  it("flags candidate with more than one source (patch + branch + baseline)", () => {
    const spec = validMinimalSpec();
    spec.candidates = [
      {
        id: "multi",
        patch: "a.patch",
        branch: "feature/x",
        baseline: true,
      } as any,
    ];
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("spec.candidate-ambiguous-source");
    }
  });

  it("flags candidate without any source", () => {
    const spec = validMinimalSpec();
    spec.candidates = [{ id: "bare" } as any];
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("spec.candidate-ambiguous-source");
    }
  });

  it("accepts a valid minimal spec", () => {
    const result = validateSpec(validMinimalSpec());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.topic).toBe("demo");
      expect(result.spec.metrics.length).toBe(2);
      expect(result.spec.candidates.length).toBe(2);
      expect(result.spec.version).toBe(1);
    }
  });
});

describe("loadSpec", () => {
  it("returns spec.missing when the file does not exist", () => {
    const root = tmpProject();
    const result = loadSpec(path.join(root, "nope.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("spec.missing");
    }
  });

  it("returns spec.parse-error on malformed JSON", () => {
    const root = tmpProject();
    const file = path.join(root, "spec.json");
    writeFileSync(file, "{ not json");
    const result = loadSpec(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("spec.parse-error");
    }
  });

  it("loads a valid JSON spec from disk", () => {
    const root = tmpProject();
    const file = path.join(root, "spec.json");
    writeFileSync(file, JSON.stringify(validMinimalSpec()));
    const result = loadSpec(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.topic).toBe("demo");
      expect(result.sourcePath).toBe(path.resolve(file));
    }
  });
});
