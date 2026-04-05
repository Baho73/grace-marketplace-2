import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { lintGraceProject } from "./grace-lint";

function createProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "grace-lint-"));
  mkdirSync(path.join(root, "docs"), { recursive: true });
  mkdirSync(path.join(root, "src"), { recursive: true });
  return root;
}

describe("lintGraceProject", () => {
  it("passes a well-formed GRACE project", () => {
    const root = createProject();

    writeFileSync(
      path.join(root, "docs/knowledge-graph.xml"),
      `<KnowledgeGraph>
  <Project NAME="Example" VERSION="0.1.0">
    <M-EXAMPLE NAME="Example" TYPE="CORE_LOGIC">
      <purpose>Run the example flow.</purpose>
      <path>src/example.ts</path>
      <depends>none</depends>
      <verification-ref>V-M-EXAMPLE</verification-ref>
      <annotations>
        <fn-run PURPOSE="Run the example flow" />
        <export-run PURPOSE="Public module entry point" />
      </annotations>
    </M-EXAMPLE>
  </Project>
</KnowledgeGraph>`,
    );

    writeFileSync(
      path.join(root, "docs/development-plan.xml"),
      `<DevelopmentPlan VERSION="0.1.0">
  <Modules>
    <M-EXAMPLE NAME="Example" TYPE="CORE_LOGIC" STATUS="planned">
      <contract>
        <purpose>Run the example flow.</purpose>
      </contract>
      <verification-ref>V-M-EXAMPLE</verification-ref>
    </M-EXAMPLE>
  </Modules>
  <ImplementationOrder>
    <Phase-1 name="Foundation" status="pending">
      <step-1 module="M-EXAMPLE" status="pending" verification="V-M-EXAMPLE">Implement example.</step-1>
    </Phase-1>
  </ImplementationOrder>
</DevelopmentPlan>`,
    );

    writeFileSync(
      path.join(root, "docs/verification-plan.xml"),
      `<VerificationPlan VERSION="0.1.0">
  <ModuleVerification>
    <V-M-EXAMPLE MODULE="M-EXAMPLE">
      <test-files>
        <file-1>src/example.test.ts</file-1>
      </test-files>
      <module-checks>
        <command-1>bun test src/example.test.ts</command-1>
      </module-checks>
    </V-M-EXAMPLE>
  </ModuleVerification>
</VerificationPlan>`,
    );

    writeFileSync(
      path.join(root, "docs/operational-packets.xml"),
      `<OperationalPackets VERSION="0.1.0">
  <ExecutionPacketTemplate>
    <ExecutionPacket />
  </ExecutionPacketTemplate>
  <GraphDeltaTemplate>
    <GraphDelta />
  </GraphDeltaTemplate>
  <VerificationDeltaTemplate>
    <VerificationDelta />
  </VerificationDeltaTemplate>
  <FailurePacketTemplate>
    <FailurePacket />
  </FailurePacketTemplate>
</OperationalPackets>`,
    );

    writeFileSync(
      path.join(root, "src/example.ts"),
      `// START_MODULE_CONTRACT
//   PURPOSE: Run the example flow.
//   SCOPE: Execute the happy path.
//   DEPENDS: none
//   LINKS: M-EXAMPLE
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   run - Execute the example flow.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v0.1.0 - Added example module]
// END_CHANGE_SUMMARY
//
// START_CONTRACT: run
//   PURPOSE: Run the example flow.
//   INPUTS: { none }
//   OUTPUTS: { string - flow status }
//   SIDE_EFFECTS: none
//   LINKS: M-EXAMPLE
// END_CONTRACT: run
export function run() {
  // START_BLOCK_EXECUTE_FLOW
  return "ok";
  // END_BLOCK_EXECUTE_FLOW
}
`,
    );

    const result = lintGraceProject(root);
    expect(result.issues).toHaveLength(0);
  });

  it("reports generic XML tags and semantic markup problems", () => {
    const root = createProject();

    writeFileSync(
      path.join(root, "docs/knowledge-graph.xml"),
      `<KnowledgeGraph>
  <Project NAME="Broken" VERSION="0.1.0">
    <Module ID="M-EXAMPLE">
      <verification-ref>V-M-EXAMPLE</verification-ref>
    </Module>
  </Project>
</KnowledgeGraph>`,
    );

    writeFileSync(
      path.join(root, "docs/development-plan.xml"),
      `<DevelopmentPlan VERSION="0.1.0">
  <Modules>
    <M-EXAMPLE NAME="Example" TYPE="CORE_LOGIC">
      <verification-ref>V-M-MISSING</verification-ref>
    </M-EXAMPLE>
  </Modules>
  <ImplementationOrder>
    <Phase number="1">
      <step order="1" module="M-EXAMPLE" verification="V-M-MISSING">Broken step.</step>
    </Phase>
  </ImplementationOrder>
</DevelopmentPlan>`,
    );

    writeFileSync(path.join(root, "docs/verification-plan.xml"), `<VerificationPlan VERSION="0.1.0" />`);

    writeFileSync(
      path.join(root, "src/example.ts"),
      `// START_MODULE_CONTRACT
//   PURPOSE: Broken module.
// END_MODULE_CONTRACT
// START_MODULE_MAP
// END_MODULE_MAP
export function run() {
  // START_BLOCK_DUPLICATE
  return "ok";
  // END_BLOCK_OTHER
}
`,
    );

    const result = lintGraceProject(root);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("xml.generic-module-tag");
    expect(codes).toContain("xml.generic-phase-tag");
    expect(codes).toContain("xml.generic-step-tag");
    expect(codes).toContain("markup.missing-change-summary");
    expect(codes).toContain("markup.empty-module-map");
    expect(codes).toContain("markup.mismatched-block-end");
    expect(codes).toContain("plan.missing-verification-entry");
  });

  it("allows partial repositories when requested", () => {
    const root = createProject();
    writeFileSync(path.join(root, "src/plain.ts"), `export const value = 1;\n`);

    const result = lintGraceProject(root, { allowMissingDocs: true });
    expect(result.issues).toHaveLength(0);
  });
});
