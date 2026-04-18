// FILE: src/grace-status.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: citty subcommand `grace status` (with --brief for SessionStart hooks).
//   SCOPE: CLI wiring + text/json output. Computation delegated to grace-status-runtime.
//   DEPENDS: citty, ./grace-status-runtime
//   LINKS: docs/knowledge-graph.xml#M-CLI-STATUS, docs/verification-plan.xml#V-M-CLI-STATUS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   statusCommand - citty subcommand exposing --path, --brief, --format, --json
// END_MODULE_MAP

import { defineCommand } from "citty";

import { collectBrief, renderBrief, renderFull } from "./grace-status-runtime";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Report GRACE project health: artifact presence, module count, verification coverage, pending steps, and next recommended action.",
  },
  args: {
    path: {
      type: "string",
      alias: "p",
      description: "Project root to inspect",
      default: ".",
    },
    brief: {
      type: "boolean",
      description: "Emit a compact (<=30 line) snapshot suitable for SessionStart hooks",
      default: false,
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: text or json",
      default: "text",
    },
    json: {
      type: "boolean",
      description: "Shortcut for --format json",
      default: false,
    },
  },
  async run(context) {
    const root = String(context.args.path ?? ".");
    const format = Boolean(context.args.json) ? "json" : String(context.args.format ?? "text");
    if (format !== "text" && format !== "json") {
      throw new Error(`Unsupported format \`${format}\`. Use \`text\` or \`json\`.`);
    }

    const status = collectBrief(root);

    if (format === "json") {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }

    if (Boolean(context.args.brief) || !status.initialized) {
      process.stdout.write(`${renderBrief(root, status)}\n`);
      return;
    }

    process.stdout.write(`${renderFull(root, status)}\n`);
  },
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0] Initial module for `grace status` + `--brief` SessionStart-hook output.
// END_CHANGE_SUMMARY
