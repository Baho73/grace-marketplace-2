#!/usr/bin/env bun

import { defineCommand, type CommandDef, runMain } from "citty";

import { lintCommand } from "./grace-lint";

const main = defineCommand({
  meta: {
    name: "grace",
    version: "3.4.0",
    description: "GRACE CLI for linting semantic markup and GRACE project artifacts.",
  },
  subCommands: {
    lint: lintCommand,
  },
});

if (import.meta.main) {
  await runMain(main as CommandDef);
}
