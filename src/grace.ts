#!/usr/bin/env bun

import { defineCommand, type CommandDef, runMain } from "citty";

import { afkCommand } from "./grace-afk";
import { evolveCommand } from "./grace-evolve";
import { fileCommand } from "./grace-file";
import { lintCommand } from "./grace-lint";
import { moduleCommand } from "./grace-module";
import { statusCommand } from "./grace-status";
import { verificationCommand } from "./grace-verification";

const main = defineCommand({
  meta: {
    name: "grace",
    version: "4.0.2",
    description: "GRACE 4 CLI for .grace linting, status snapshots, module health, verification queries, semantic markup, and artifact navigation.",
  },
  subCommands: {
    afk: afkCommand,
    evolve: evolveCommand,
    file: fileCommand,
    lint: lintCommand,
    module: moduleCommand,
    status: statusCommand,
    verification: verificationCommand,
  },
});

if (import.meta.main) {
  await runMain(main as CommandDef);
}
