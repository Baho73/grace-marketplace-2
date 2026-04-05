#!/usr/bin/env bun

import { defineCommand, type CommandDef, runMain } from "citty";

import { fileCommand } from "./grace-file";
import { lintCommand } from "./grace-lint";
import { moduleCommand } from "./grace-module";

const main = defineCommand({
  meta: {
    name: "grace",
    version: "3.6.0",
    description: "GRACE CLI for linting semantic markup and querying GRACE project artifacts.",
  },
  subCommands: {
    file: fileCommand,
    lint: lintCommand,
    module: moduleCommand,
  },
});

if (import.meta.main) {
  await runMain(main as CommandDef);
}
