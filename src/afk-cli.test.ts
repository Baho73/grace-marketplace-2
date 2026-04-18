import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";

function tmpProject() {
  return mkdtempSync(path.join(os.tmpdir(), "grace-afk-cli-"));
}

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const CLI_ENTRY = path.join(REPO_ROOT, "src", "grace.ts");

function runCli(cwd: string, args: string[]) {
  const result = spawnSync("bun", ["run", CLI_ENTRY, "afk", ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("grace afk CLI", () => {
  it("start creates state and tick reports remaining time", () => {
    const root = tmpProject();
    const start = runCli(root, ["start", "1", "--path", root]);
    expect(start.code).toBe(0);
    expect(start.stdout).toContain("Started /afk session");

    const tick = runCli(root, ["tick", "--path", root]);
    expect(tick.code).toBe(0);
    expect(tick.stdout).toMatch(/remaining=\d+/);
    expect(tick.stdout).toContain("status=active");
  });

  it("tick returns EXIT_BUDGET_EXHAUSTED once session expired", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    // Force-expire by editing expiresAt to the past.
    const docsDir = path.join(root, "docs", "afk-sessions");
    const sessionDirs = require("node:fs").readdirSync(docsDir);
    const statePath = path.join(docsDir, sessionDirs[0], "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.expiresAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const tick = runCli(root, ["tick", "--path", root]);
    expect(tick.code).toBe(42); // EXIT_BUDGET_EXHAUSTED
    expect(tick.stderr).toContain("Budget exhausted");
  });

  it("tick returns EXIT_NO_SESSION when no session has been started", () => {
    const root = tmpProject();
    const tick = runCli(root, ["tick", "--path", root]);
    expect(tick.code).toBe(43); // EXIT_NO_SESSION
    expect(tick.stderr).toContain("no active session");
  });

  it("journal and defer append to files and increment counters", () => {
    const root = tmpProject();
    runCli(root, ["start", "2", "--path", root]);

    const journal = runCli(root, [
      "journal",
      "--path",
      root,
      "--class",
      "reversible-act",
      "--title",
      "Test",
      "--rationale",
      "because",
      "--outcome",
      "ok",
    ]);
    expect(journal.code).toBe(0);

    const defer = runCli(root, [
      "defer",
      "--path",
      root,
      "--question",
      "what next?",
      "--contextLine",
      "step-1",
    ]);
    expect(defer.code).toBe(0);

    const docsDir = path.join(root, "docs", "afk-sessions");
    const sessionId = require("node:fs").readdirSync(docsDir)[0];
    const decisionsPath = path.join(docsDir, sessionId, "decisions.md");
    const deferredPath = path.join(docsDir, sessionId, "deferred.md");
    expect(existsSync(decisionsPath)).toBe(true);
    expect(existsSync(deferredPath)).toBe(true);
    expect(readFileSync(decisionsPath, "utf8")).toContain("reversible-act");
    expect(readFileSync(deferredPath, "utf8")).toContain("what next?");

    const statePath = path.join(docsDir, sessionId, "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.deferred).toBe(1);
  });

  it("stop marks session stopped and subsequent tick exits with EXIT_SESSION_STOPPED", () => {
    const root = tmpProject();
    runCli(root, ["start", "2", "--path", root]);
    const stop = runCli(root, ["stop", "--path", root, "--reason", "test"]);
    expect(stop.code).toBe(0);

    const tick = runCli(root, ["tick", "--path", root]);
    expect(tick.code).toBe(44); // EXIT_SESSION_STOPPED
    expect(tick.stderr).toContain("stopped");
  });

  it("report shows summary and marks completed", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);
    const report = runCli(root, ["report", "--path", root]);
    expect(report.code).toBe(0);
    expect(report.stdout).toContain("report");
    expect(report.stdout).toContain("Status:");

    // After report, session is completed; tick should exit with no-active-session.
    const tick = runCli(root, ["tick", "--path", root]);
    expect(tick.code).toBe(43);
  });
});
