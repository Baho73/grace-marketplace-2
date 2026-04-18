#!/usr/bin/env bun

import { defineCommand, type CommandDef, runMain } from "citty";

import { fileCommand } from "./grace-file";
import { lintCommand } from "./grace-lint";
import { moduleCommand } from "./grace-module";
import { statusCommand } from "./grace-status";

const main = defineCommand({
  meta: {
    name: "grace",
    version: "3.7.0",
    description: "GRACE CLI for linting semantic markup and querying GRACE project artifacts.",
  },
  subCommands: {
    file: fileCommand,
    lint: lintCommand,
    module: moduleCommand,
    status: statusCommand,
  },
});

if (import.meta.main) {
  await runMain(main as CommandDef);
}
