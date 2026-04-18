import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { lintSkillSections } from "./lint/skill-sections";

function createSkillsProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "grace-skills-lint-"));
  return root;
}

function writeSkill(root: string, name: string, contents: string) {
  const dir = path.join(root, "skills", "grace", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), contents);
}

const COMPLETE_SKILL = `---
name: sample
description: "Sample."
---

Body.

## Common Rationalizations

| a | b |

## When NOT to Use

- item

## Verification

- [ ] check
`;

const MISSING_ALL_SKILL = `---
name: sample
description: "Sample."
---

Body only.
`;

const PARTIAL_SKILL = `---
name: sample
description: "Sample."
---

Body.

## Common Rationalizations

| a | b |
`;

describe("lintSkillSections", () => {
  it("returns no issues when all sections are present", () => {
    const root = createSkillsProject();
    writeSkill(root, "s-complete", COMPLETE_SKILL);

    const issues = lintSkillSections(root);

    expect(issues).toEqual([]);
  });

  it("flags missing rationalizations, when-not, and verification sections", () => {
    const root = createSkillsProject();
    writeSkill(root, "s-missing-all", MISSING_ALL_SKILL);

    const issues = lintSkillSections(root);
    const codes = issues.map((issue) => issue.code).sort();

    expect(codes).toContain("skill.missing-rationalizations");
    expect(codes).toContain("skill.missing-when-not");
    expect(codes).toContain("skill.missing-verification");
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  it("flags only missing sections when skill is partial", () => {
    const root = createSkillsProject();
    writeSkill(root, "s-partial", PARTIAL_SKILL);

    const issues = lintSkillSections(root);
    const codes = issues.map((issue) => issue.code).sort();

    expect(codes).not.toContain("skill.missing-rationalizations");
    expect(codes).toContain("skill.missing-when-not");
    expect(codes).toContain("skill.missing-verification");
  });

  it("scans plugins/ mirror in addition to skills/", () => {
    const root = createSkillsProject();
    const dir = path.join(root, "plugins", "grace", "skills", "grace", "mirror");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), MISSING_ALL_SKILL);

    const issues = lintSkillSections(root);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.file.startsWith("plugins/")).toBe(true);
  });

  it("returns empty when no skills directory exists", () => {
    const root = createSkillsProject();
    const issues = lintSkillSections(root);
    expect(issues).toEqual([]);
  });
});
