import { defineCommand } from "citty";

import { findModules, loadGraceArtifactIndex, resolveModule } from "./query/core";
import { formatModuleFindTable, formatModuleText } from "./query/render";

function resolveFormat(format: unknown, json: unknown, allowed: string[], defaultFormat: string) {
  const resolved = Boolean(json) ? "json" : String(format ?? defaultFormat);
  if (!allowed.includes(resolved)) {
    throw new Error(`Unsupported format \`${resolved}\`. Use ${allowed.map((value) => `\`${value}\``).join(" or ")}.`);
  }

  return resolved;
}

export const moduleCommand = defineCommand({
  meta: {
    name: "module",
    description: "Query shared GRACE module artifacts.",
  },
  subCommands: {
    find: defineCommand({
      meta: {
        name: "find",
        description: "Find GRACE modules by id, name, path, purpose, annotations, verification, or dependencies.",
      },
      args: {
        query: {
          type: "positional",
          required: false,
          description: "Search query or path",
        },
        path: {
          type: "string",
          alias: "p",
          description: "Project root to inspect",
          default: ".",
        },
        type: {
          type: "string",
          description: "Filter by module type",
        },
        dependsOn: {
          type: "string",
          description: "Filter by dependency id",
        },
        format: {
          type: "string",
          alias: "f",
          description: "Output format: table or json",
          default: "table",
        },
        json: {
          type: "boolean",
          description: "Shortcut for --format json",
          default: false,
        },
      },
      async run(context) {
        const format = resolveFormat(context.args.format, context.args.json, ["table", "json"], "table");
        const index = loadGraceArtifactIndex(String(context.args.path ?? "."));
        const matches = findModules(index, {
          query: context.args.query ? String(context.args.query) : undefined,
          type: context.args.type ? String(context.args.type) : undefined,
          dependsOn: context.args.dependsOn ? String(context.args.dependsOn) : undefined,
        });

        if (format === "json") {
          process.stdout.write(`${JSON.stringify(matches, null, 2)}\n`);
          return;
        }

        process.stdout.write(`${formatModuleFindTable(matches)}\n`);
      },
    }),
    show: defineCommand({
      meta: {
        name: "show",
        description: "Show the shared/public GRACE record for a module id or path.",
      },
      args: {
        target: {
          type: "positional",
          description: "Module id or file/path target",
        },
        path: {
          type: "string",
          alias: "p",
          description: "Project root to inspect",
          default: ".",
        },
        with: {
          type: "string",
          description: "Optional extras, currently supports: verification",
          default: "",
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
        const format = resolveFormat(context.args.format, context.args.json, ["text", "json"], "text");
        const index = loadGraceArtifactIndex(String(context.args.path ?? "."));
        const moduleRecord = resolveModule(index, String(context.args.target));
        const includeVerification = String(context.args.with ?? "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .includes("verification");

        if (format === "json") {
          process.stdout.write(`${JSON.stringify(moduleRecord, null, 2)}\n`);
          return;
        }

        process.stdout.write(`${formatModuleText(moduleRecord, { withVerification: includeVerification })}\n`);
      },
    }),
  },
});
