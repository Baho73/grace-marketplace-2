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
  // Invoke `bun <file>` rather than `bun run <file>` — `bun run` wraps the child and on Windows
  // does not reliably propagate custom exit codes above a single-digit range (observed: any
  // `process.exitCode = 46` became 255 at the parent). Direct invocation passes the real code
  // through.
  const result = spawnSync("bun", [CLI_ENTRY, "afk", ...args], {
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

describe("grace afk CLI — argument validation and fallbacks", () => {
  it("journal rejects an unknown --class value with EXIT_BAD_ARGS", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    const result = runCli(root, [
      "journal",
      "--path",
      root,
      "--class",
      "not-a-real-class",
      "--title",
      "x",
      "--rationale",
      "x",
      "--outcome",
      "x",
    ]);

    expect(result.code).toBe(2); // EXIT_BAD_ARGS
    expect(result.stderr).toContain("invalid --class");
    expect(result.stderr).toContain("reversible-act"); // lists allowed values
  });

  it("journal accepts --context as the canonical arg name", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);
    const result = runCli(root, [
      "journal",
      "--path",
      root,
      "--class",
      "reversible-act",
      "--title",
      "t",
      "--context",
      "plan step-1",
      "--rationale",
      "r",
      "--outcome",
      "o",
    ]);
    expect(result.code).toBe(0);

    const docsDir = path.join(root, "docs", "afk-sessions");
    const sessionId = require("node:fs").readdirSync(docsDir)[0];
    const decisions = readFileSync(path.join(docsDir, sessionId, "decisions.md"), "utf8");
    expect(decisions).toContain("plan step-1");
  });

  it("defer requires --context (or --contextLine alias) and fails with EXIT_BAD_ARGS otherwise", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    const noContext = runCli(root, ["defer", "--path", root, "--question", "q"]);
    expect(noContext.code).toBe(2);
    expect(noContext.stderr).toContain("context");

    const withAlias = runCli(root, [
      "defer",
      "--path",
      root,
      "--question",
      "q",
      "--contextLine",
      "ctx-via-alias",
    ]);
    expect(withAlias.code).toBe(0);
  });

  it("ask exits with EXIT_CONFIG_MISSING (46) when .grace-afk.json is absent", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    const result = runCli(root, [
      "ask",
      "--path",
      root,
      "--title",
      "merge to main",
      "--context",
      "plan is complete",
      "--options",
      "A:merge;B:wait",
      "--mypick",
      "A",
      "--confidence",
      "80",
    ]);

    expect(result.code).toBe(46); // EXIT_CONFIG_MISSING
    expect(result.stderr).toContain("Telegram not configured");
    expect(result.stderr).toContain("defer");
  });

  it("check exits with EXIT_CONFIG_MISSING (46) when .grace-afk.json is absent", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    const result = runCli(root, [
      "check",
      "--path",
      root,
      "--correlation",
      "abc123",
      "--messageid",
      "42",
    ]);

    expect(result.code).toBe(46);
    expect(result.stderr).toContain("Telegram not configured");
  });

  it("ask refuses after max escalations with EXIT_BAD_ARGS", () => {
    const root = tmpProject();
    runCli(root, ["start", "1", "--path", root]);

    // Drop a config that points at an unreachable telegram API so sendMessage will never be called
    // once the max-escalations gate fires. We bump escalations via direct state.json edits.
    const docsDir = path.join(root, "docs", "afk-sessions");
    const sessionId = require("node:fs").readdirSync(docsDir)[0];
    const statePath = path.join(docsDir, sessionId, "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.escalations = 3;
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    // Minimal config so `getTelegram` returns non-null and the code proceeds to the cap check.
    writeFileSync(
      path.join(root, ".grace-afk.json"),
      JSON.stringify({
        telegram: { botToken: "x", chatId: "y" },
        autoStop: { maxEscalationsPerSession: 3 },
      }),
    );

    const result = runCli(root, [
      "ask",
      "--path",
      root,
      "--title",
      "t",
      "--context",
      "c",
      "--options",
      "A:x;B:y",
    ]);

    expect(result.code).toBe(2); // EXIT_BAD_ARGS per post-review unification
    expect(result.stderr).toContain("max 3 escalations");
    expect(result.stderr).toContain("defer");
  });

  it("tick updates lastTickAt atomically and is safe to call repeatedly", () => {
    const root = tmpProject();
    runCli(root, ["start", "2", "--path", root]);

    for (let index = 0; index < 10; index += 1) {
      const tick = runCli(root, ["tick", "--path", root]);
      expect(tick.code).toBe(0);
    }

    const docsDir = path.join(root, "docs", "afk-sessions");
    const sessionId = require("node:fs").readdirSync(docsDir)[0];
    const statePath = path.join(docsDir, sessionId, "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.lastTickAt).toBeTruthy();
    expect(state.status).toBe("active");
  });
});
