// FILE: src/lint/skill-sections.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Lint rule warning when a SKILL.md lacks the three required discipline sections.
//   SCOPE: Scan skills/ and plugins/ under project root; check for "## Common Rationalizations", "## When NOT to Use", "## Verification".
//   DEPENDS: node:fs, node:path, ./types
//   LINKS: docs/knowledge-graph.xml#M-LINT-SKILL-SECTIONS, docs/verification-plan.xml#V-M-LINT-SKILL-SECTIONS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   lintSkillSections - Scan skills/ + plugins/ and return warning-severity LintIssues for missing sections
// END_MODULE_MAP

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { LintIssue } from "./types";

const REQUIRED_SKILL_SECTIONS = [
  { heading: "## Common Rationalizations", code: "skill.missing-rationalizations" },
  { heading: "## When NOT to Use", code: "skill.missing-when-not" },
  { heading: "## Verification", code: "skill.missing-verification" },
] as const;

const SKILL_SEARCH_DIRS = ["skills", "plugins"] as const;

function collectSkillFiles(root: string): string[] {
  const files: string[] = [];
  for (const searchDir of SKILL_SEARCH_DIRS) {
    const base = path.join(root, searchDir);
    if (!existsSync(base)) {
      continue;
    }
    walk(base, files);
  }
  return files;
}

function walk(dir: string, acc: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".git") {
        continue;
      }
      walk(fullPath, acc);
    } else if (stats.isFile() && entry === "SKILL.md") {
      acc.push(fullPath);
    }
  }
}

export function lintSkillSections(projectRoot: string): LintIssue[] {
  const root = path.resolve(projectRoot);
  const issues: LintIssue[] = [];

  for (const filePath of collectSkillFiles(root)) {
    const text = readFileSync(filePath, "utf8");
    const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");

    for (const { heading, code } of REQUIRED_SKILL_SECTIONS) {
      if (!containsHeading(text, heading)) {
        issues.push({
          severity: "warning",
          code,
          file: relativePath,
          message: `${relativePath} is missing required section \`${heading}\`.`,
        });
      }
    }
  }

  return issues;
}

function containsHeading(text: string, heading: string) {
  const normalized = heading.trim();
  return text.split(/\r?\n/).some((line) => line.trim() === normalized);
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0] Initial module for SKILL.md discipline-section lint warnings.
// END_CHANGE_SUMMARY
