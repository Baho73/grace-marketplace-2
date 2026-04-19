// FILE: src/grace-evolve.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: citty subcommand `grace evolve` — drive the evolve orchestrator from CLI (init / run / show).
//   SCOPE: CLI wiring only. Business logic lives in src/evolve/*.
//   DEPENDS: citty, node:fs, node:path, ./evolve/*
//   LINKS: docs/knowledge-graph.xml#M-CLI-EVOLVE, skills/grace/grace-evolve/SKILL.md
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   evolveCommand   - Root citty command with subcommands init, run, show
// END_MODULE_MAP

import { defineCommand } from "citty";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { archivePath } from "./evolve/archive";
import { runEvolve } from "./evolve/orchestrator";
import { loadSpec } from "./evolve/spec";
import type { ProblemSpec } from "./evolve/types";

const EXIT_BAD_ARGS = 2;
const EXIT_SPEC_INVALID = 47;
const EXIT_EVOLVE_FAILED = 48;

function toPath(value: unknown, fallback = "."): string {
  return path.resolve(String(value ?? fallback));
}

const SPEC_TEMPLATE: ProblemSpec = {
  version: 1,
  topic: "example",
  goal: "Minimize test-suite runtime without losing coverage.",
  metrics: [
    {
      id: "test-seconds",
      description: "Wall time of the test suite, lower is better.",
      command: "bun test --reporter=silent 2>&1 | tail -1",
      parser: "\\[(\\d+(?:\\.\\d+)?)s\\]",
      direction: "lower-is-better",
      weight: 1,
    },
    {
      id: "test-pass",
      description: "Number of passing tests; veto-guarded against regressions.",
      command: "bun test 2>&1 | awk '/ pass/ {print $1}' | head -1",
      direction: "higher-is-better",
      weight: 1,
      veto: 0,
    },
  ],
  candidates: [
    { id: "baseline", baseline: true, description: "Unmodified HEAD" },
  ],
  stopping: {
    maxCandidates: 8,
    maxSeconds: 3600,
    earlyStopAfterNoImprovement: 3,
  },
};

export const evolveCommand = defineCommand({
  meta: {
    name: "evolve",
    description: "Evolutionary search over candidate solutions (MVP: user-authored candidates + metric runner).",
  },
  subCommands: {
    init: defineCommand({
      meta: {
        name: "init",
        description: "Scaffold docs/experiments/<topic>/spec.json with a starter template.",
      },
      args: {
        topic: { type: "positional", required: true, description: "Short kebab-case topic name" },
        path: { type: "string", alias: "p", description: "Project root", default: "." },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const topic = String(context.args.topic);
        const dir = path.join(projectRoot, "docs", "experiments", topic.replace(/[^a-z0-9-_]/gi, "_"));
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const specPath = path.join(dir, "spec.json");
        if (existsSync(specPath)) {
          process.stderr.write(`grace evolve init: ${specPath} already exists; refusing to overwrite.\n`);
          process.exitCode = EXIT_BAD_ARGS;
          return;
        }
        const spec: ProblemSpec = { ...SPEC_TEMPLATE, topic };
        writeFileSync(specPath, JSON.stringify(spec, null, 2));
        process.stdout.write(`scaffolded ${path.relative(projectRoot, specPath)}\nedit it to declare real candidates and metrics before running \`grace evolve run ${topic}\`.\n`);
      },
    }),

    run: defineCommand({
      meta: {
        name: "run",
        description: "Execute the evolve loop for a spec. Writes docs/experiments/<topic>/results.xml.",
      },
      args: {
        topic: { type: "positional", required: true, description: "Topic name (directory under docs/experiments/)" },
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        spec: { type: "string", description: "Spec file path (default: docs/experiments/<topic>/spec.json)", default: "" },
        session: {
          type: "string",
          description: "Session id for worktree naming (default: timestamp)",
          default: "",
        },
        timeout: {
          type: "string",
          description: "Per-command timeout in seconds (default 600)",
          default: "600",
        },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const topic = String(context.args.topic);
        const specPath = String(context.args.spec) || path.join(projectRoot, "docs", "experiments", topic, "spec.json");
        const sessionId = String(context.args.session) || new Date().toISOString().replace(/[:.]/g, "").slice(0, 17) + "Z";
        const timeoutSec = Number(context.args.timeout || 600);
        const perCommandTimeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : undefined;

        const loaded = loadSpec(specPath);
        if (!loaded.ok) {
          process.stderr.write(`grace evolve run: spec invalid\n`);
          for (const error of loaded.errors) {
            process.stderr.write(`  [${error.code}] ${error.message}${error.path ? ` (${error.path})` : ""}\n`);
          }
          process.exitCode = EXIT_SPEC_INVALID;
          return;
        }
        if (loaded.spec.topic !== topic) {
          process.stderr.write(
            `grace evolve run: spec topic "${loaded.spec.topic}" does not match CLI topic "${topic}". Refusing to mix.\n`,
          );
          process.exitCode = EXIT_BAD_ARGS;
          return;
        }

        try {
          const result = await runEvolve({
            projectRoot,
            spec: loaded.spec,
            sessionId,
            perCommandTimeoutMs,
            progress: (event) => {
              process.stdout.write(`[${event.kind}] ${event.message}\n`);
            },
          });
          const winner = result.archive.winnerCandidateId ?? "—";
          process.stdout.write(
            `\nevolve complete: stoppedBy=${result.archive.stoppedBy}, trials=${result.archive.trials.length}, winner=${winner}\narchive: ${path.relative(projectRoot, result.archivePath)}\n`,
          );
        } catch (error) {
          process.stderr.write(`grace evolve run: unexpected failure — ${error instanceof Error ? error.message : String(error)}\n`);
          process.exitCode = EXIT_EVOLVE_FAILED;
        }
      },
    }),

    show: defineCommand({
      meta: {
        name: "show",
        description: "Print the latest archive for a topic.",
      },
      args: {
        topic: { type: "positional", required: true, description: "Topic name" },
        path: { type: "string", alias: "p", description: "Project root", default: "." },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const topic = String(context.args.topic);
        const file = archivePath(projectRoot, topic);
        if (!existsSync(file)) {
          process.stderr.write(`no archive at ${path.relative(projectRoot, file)}. Run \`grace evolve run ${topic}\` first.\n`);
          process.exitCode = EXIT_BAD_ARGS;
          return;
        }
        process.stdout.write(readFileSync(file, "utf8"));
      },
    }),
  },
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Three subcommands: init / run / show. MVP without LLM-critic loop.
// END_CHANGE_SUMMARY
