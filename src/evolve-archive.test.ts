import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { archivePath, renderArchive, writeArchive } from "./evolve/archive";
import type { EvolveArchive, ProblemSpec, TrialResult } from "./evolve/types";

function tmpProject() {
  return mkdtempSync(path.join(os.tmpdir(), "grace-evolve-archive-"));
}

function sampleSpec(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
  return {
    version: 1,
    topic: "demo",
    goal: "improve throughput",
    metrics: [
      { id: "acc", command: "echo 1", direction: "higher-is-better", weight: 2 },
      { id: "lat", command: "echo 2", direction: "lower-is-better", veto: 500 },
    ],
    candidates: [{ id: "a", baseline: true }],
    stopping: {},
    ...overrides,
  };
}

function sampleTrial(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    candidateId: "a",
    startedAt: "2026-04-18T10:00:00.000Z",
    finishedAt: "2026-04-18T10:01:00.000Z",
    metrics: [
      {
        metricId: "acc",
        command: "echo 0.9",
        rawStdout: "0.9\n",
        value: 0.9,
        parseError: null,
        durationMs: 10,
        exitCode: 0,
      },
      {
        metricId: "lat",
        command: "echo 100",
        rawStdout: "100\n",
        value: null,
        parseError: "something broke",
        durationMs: 5,
        exitCode: 1,
      },
    ],
    score: 0.75,
    verdict: "advance",
    reason: null,
    worktreePath: "/tmp/wt/a",
    ...overrides,
  };
}

function sampleArchive(overrides: Partial<EvolveArchive> = {}): EvolveArchive {
  const spec = overrides.spec ?? sampleSpec();
  return {
    version: 1,
    topic: spec.topic,
    startedAt: "2026-04-18T10:00:00.000Z",
    finishedAt: "2026-04-18T10:05:00.000Z",
    spec,
    trials: [sampleTrial()],
    winnerCandidateId: "a",
    stoppedBy: "exhausted",
    ...overrides,
  };
}

describe("archivePath", () => {
  it("normalizes unsafe characters in topic", () => {
    const root = "/repo";
    const unsafe = archivePath(root, "my topic/with:weird*chars");
    expect(unsafe.endsWith("results.xml")).toBe(true);
    const normalized = path.basename(path.dirname(unsafe));
    expect(normalized).toBe("my_topic_with_weird_chars");
    expect(unsafe).toContain(path.join("docs", "experiments"));
  });

  it("keeps safe characters in topic as-is", () => {
    const root = "/repo";
    const out = archivePath(root, "safe-topic_1");
    expect(path.basename(path.dirname(out))).toBe("safe-topic_1");
  });
});

describe("renderArchive", () => {
  it("includes the top-level envelope, topic, goal, metrics and trials", () => {
    const xml = renderArchive(sampleArchive());
    expect(xml).toContain(`<EvolveArchive VERSION="1">`);
    expect(xml).toContain(`<Topic>demo</Topic>`);
    expect(xml).toContain(`<Goal>improve throughput</Goal>`);
    expect(xml).toContain(`<StartedAt>2026-04-18T10:00:00.000Z</StartedAt>`);
    expect(xml).toContain(`<Metrics>`);
    expect(xml).toContain(`<M-acc DIRECTION="higher-is-better"`);
    expect(xml).toContain(`<M-lat DIRECTION="lower-is-better"`);
    expect(xml).toContain(`<Trials>`);
    expect(xml).toContain(`<T-a`);
    expect(xml).toContain(`VERDICT="advance"`);
    expect(xml).toContain(`<Worktree>/tmp/wt/a</Worktree>`);
    expect(xml).toContain(`<m-acc VALUE="0.9"`);
    expect(xml).toContain(`<ParseError>something broke</ParseError>`);
    expect(xml.trim().endsWith("</EvolveArchive>")).toBe(true);
  });

  it("includes Winner / StoppedBy / FinishedAt when set", () => {
    const xml = renderArchive(sampleArchive());
    expect(xml).toContain(`<Winner>a</Winner>`);
    expect(xml).toContain(`<StoppedBy>exhausted</StoppedBy>`);
    expect(xml).toContain(`<FinishedAt>2026-04-18T10:05:00.000Z</FinishedAt>`);
  });

  it("omits optional top-level Winner / StoppedBy / archive-level FinishedAt when absent", () => {
    const xml = renderArchive(
      sampleArchive({
        winnerCandidateId: null,
        stoppedBy: null,
        finishedAt: null,
      }),
    );
    expect(xml.includes("<Winner>")).toBe(false);
    expect(xml.includes("<StoppedBy>")).toBe(false);
    // Archive-level FinishedAt lives 2 spaces deep; trial-level FinishedAt is 6 spaces deep.
    // Use line-anchored match so we don't conflate them.
    expect(xml).not.toMatch(/^ {2}<FinishedAt>/m);
  });

  it("XML-escapes special characters in topic, goal and reason", () => {
    const archive = sampleArchive({
      topic: `a<b&c>d"e'f`,
      spec: sampleSpec({ topic: `a<b&c>d"e'f`, goal: `<script>alert("x & 'y'")</script>` }),
      trials: [
        sampleTrial({
          reason: `fail <tag> & "quotes" 'and' more`,
          verdict: "failed",
          metrics: [],
        }),
      ],
    });
    const xml = renderArchive(archive);
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&#39;");
    // The raw characters (other than the structural XML tags) should not leak verbatim.
    expect(xml.includes("<script>")).toBe(false);
    expect(xml.includes(`a<b&c>d"e'f`)).toBe(false);
  });
});

describe("writeArchive", () => {
  it("creates the docs/experiments/<topic>/ directory and writes results.xml", () => {
    const root = tmpProject();
    const archive = sampleArchive();
    const written = writeArchive(root, archive);

    expect(existsSync(written)).toBe(true);
    expect(written).toBe(archivePath(root, archive.topic));
    expect(written.endsWith("results.xml")).toBe(true);

    const content = readFileSync(written, "utf8");
    expect(content).toContain(`<EvolveArchive VERSION="1">`);
    expect(content).toContain(`<Topic>demo</Topic>`);
  });

  it("overwrites an existing archive atomically on a second call", () => {
    const root = tmpProject();
    const first = writeArchive(root, sampleArchive());
    const second = writeArchive(
      root,
      sampleArchive({ winnerCandidateId: null, stoppedBy: "target" }),
    );

    expect(second).toBe(first);
    expect(existsSync(second)).toBe(true);
    const content = readFileSync(second, "utf8");
    expect(content).toContain(`<StoppedBy>target</StoppedBy>`);
    expect(content.includes("<Winner>")).toBe(false);
    // No leftover temp files in the output directory.
    const dir = path.dirname(second);
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const entries = readdirSync(dir);
    expect(entries).toContain("results.xml");
    for (const entry of entries) {
      expect(entry.endsWith(".tmp")).toBe(false);
    }
  });
});
