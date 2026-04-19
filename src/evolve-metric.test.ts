import { describe, expect, it } from "bun:test";

import { DEFAULT_PARSER, parseMetricOutput } from "./evolve/metric";

describe("parseMetricOutput - default parser", () => {
  it("returns the value from the last numeric-only line", () => {
    const result = parseMetricOutput("0.5\n42\n");
    expect(result.error).toBeNull();
    expect(result.value).toBe(42);
  });

  it("picks the last numeric-only line even when stdout is mixed", () => {
    const stdout = [
      "Running benchmark...",
      "iteration 1 done",
      "partial: 3.14",
      "final:",
      "  12.75  ",
      "ok",
      "99",
    ].join("\n");
    const result = parseMetricOutput(stdout);
    expect(result.error).toBeNull();
    expect(result.value).toBe(99);
  });

  it("handles negative and decimal values", () => {
    const result = parseMetricOutput("warmup\n-3.14\n");
    expect(result.error).toBeNull();
    expect(result.value).toBe(-3.14);
  });

  it("returns null + error when stdout has no numeric-only line", () => {
    const result = parseMetricOutput("no numbers here\njust text");
    expect(result.value).toBeNull();
    expect(result.error).toContain("No numeric-only line");
  });

  it("exposes a non-empty DEFAULT_PARSER constant", () => {
    expect(DEFAULT_PARSER).toBeTypeOf("string");
    expect(DEFAULT_PARSER.length).toBeGreaterThan(0);
  });
});

describe("parseMetricOutput - custom parser", () => {
  it("extracts the capture group from a matching regex", () => {
    const result = parseMetricOutput("throughput=123.5 ops/s", "throughput=([\\d.]+)");
    expect(result.error).toBeNull();
    expect(result.value).toBe(123.5);
  });

  it("returns null + error when the regex does not match", () => {
    const result = parseMetricOutput("nothing to see", "throughput=([\\d.]+)");
    expect(result.value).toBeNull();
    expect(result.error).toContain("did not match");
  });

  it("returns null + error on an invalid regex", () => {
    const result = parseMetricOutput("anything", "([");
    expect(result.value).toBeNull();
    expect(result.error).toContain("Invalid parser regex");
  });

  it("returns an error when the captured group is not a finite number", () => {
    const result = parseMetricOutput("result=NaN", "result=(\\S+)");
    expect(result.value).toBeNull();
    expect(result.error).toContain("not a finite number");
  });
});
