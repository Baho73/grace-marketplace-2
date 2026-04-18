import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

function createProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "grace-status-"));
  mkdirSync(path.join(root, "docs"), { recursive: true });
  return root;
}

function writeProjectFile(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeMinimalDocs(root: string) {
  writeProjectFile(
    root,
    "docs/development-plan.xml",
    `<DevelopmentPlan VERSION="0.1.0">
  <Modules>
    <M-AUTH NAME="Auth" TYPE="CORE_LOGIC" LAYER="1" ORDER="1">
      <contract>
        <purpose>Handle authentication.</purpose>
      </contract>
      <depends>none</depends>
    </M-AUTH>
    <M-CACHE NAME="Cache" TYPE="DATA_LAYER" LAYER="1" ORDER="2">
      <contract>
        <purpose>Cache responses.</purpose>
      </contract>
      <depends>none</depends>
    </M-CACHE>
  </Modules>
  <Phases>
    <Phase-1 name="Foundation">
      <step-1 module="M-AUTH" status="pending">Implement auth.</step-1>
      <step-2 module="M-CACHE" status="completed">Implement cache.</step-2>
    </Phase-1>
  </Phases>
</DevelopmentPlan>`,
  );

  writeProjectFile(
    root,
    "docs/knowledge-graph.xml",
    `<KnowledgeGraph>
  <M-AUTH NAME="Auth" TYPE="CORE_LOGIC">
    <path>src/auth.ts</path>
  </M-AUTH>
  <M-CACHE NAME="Cache" TYPE="DATA_LAYER">
    <path>src/cache.ts</path>
  </M-CACHE>
</KnowledgeGraph>`,
  );

  writeProjectFile(
    root,
    "docs/verification-plan.xml",
    `<VerificationPlan>
  <V-M-AUTH MODULE="M-AUTH" PRIORITY="high">
    <test-files>
      <file>tests/auth.test.ts</file>
    </test-files>
  </V-M-AUTH>
</VerificationPlan>`,
  );
}

describe("grace status brief", () => {
  it("reports not-initialized when docs are missing", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "grace-status-empty-"));
    const { runStatusForTest } = await import("./grace-status-runtime");
    const status = runStatusForTest(root);

    expect(status.initialized).toBe(false);
    expect(status.missingRequired.length).toBeGreaterThan(0);
    expect(status.nextAction).toContain("grace-init");
  });

  it("reports module and verification counts when initialized", async () => {
    const root = createProject();
    writeMinimalDocs(root);
    const { runStatusForTest } = await import("./grace-status-runtime");
    const status = runStatusForTest(root);

    expect(status.initialized).toBe(true);
    expect(status.moduleCount).toBe(2);
    expect(status.verificationCount).toBe(1);
    expect(status.coveredModules).toBe(1);
    expect(status.completedSteps).toBe(1);
    expect(status.pendingSteps).toBe(1);
  });

  it("flags missing CLAUDE.md as next action", async () => {
    const root = createProject();
    writeMinimalDocs(root);
    const { runStatusForTest } = await import("./grace-status-runtime");
    const status = runStatusForTest(root);

    expect(status.missingActivation).toContain("CLAUDE.md");
    expect(status.nextAction.toLowerCase()).toContain("claude.md");
  });

  it("recommends grace-verification when coverage incomplete", async () => {
    const root = createProject();
    writeMinimalDocs(root);
    // Emit activation so that CLAUDE.md is not the top blocker
    writeProjectFile(root, "AGENTS.md", "stub");
    writeProjectFile(root, "CLAUDE.md", "stub");
    writeProjectFile(root, ".claude/settings.json", "{}");

    const { runStatusForTest } = await import("./grace-status-runtime");
    const status = runStatusForTest(root);

    expect(status.nextAction).toContain("grace-verification");
  });
});
