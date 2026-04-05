import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { findModules, loadGraceArtifactIndex, resolveGovernedFile, resolveModule } from "./query/core";

function createProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), "grace-query-"));
  mkdirSync(path.join(root, "docs"), { recursive: true });
  return root;
}

function writeProjectFile(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeQueryDocs(root: string) {
  writeProjectFile(
    root,
    "docs/development-plan.xml",
    `<DevelopmentPlan VERSION="0.1.0">
  <Modules>
    <M-DB NAME="DatabaseCore" TYPE="DATA_LAYER" LAYER="1" ORDER="1">
      <contract>
        <purpose>Provide a shared database client.</purpose>
        <inputs>
          <param name="database-config" type="Validated config" />
        </inputs>
        <outputs>
          <param name="database-api" type="DB client" />
        </outputs>
        <errors>
          <error code="DB_FAILED" />
        </errors>
      </contract>
      <interface>
        <export-db PURPOSE="Expose database client" />
      </interface>
      <depends>none</depends>
    </M-DB>
    <M-PROVIDER-PERSIST NAME="ProviderConfigPersistence" TYPE="DATA_LAYER" LAYER="2" ORDER="1">
      <contract>
        <purpose>Persist provider configuration records.</purpose>
        <inputs>
          <param name="provider-config-request" type="Provider config write request" />
        </inputs>
        <outputs>
          <param name="provider-config-result" type="Stored provider config" />
        </outputs>
        <errors>
          <error code="PROVIDER_CONFIG_PERSIST_FAILED" />
        </errors>
      </contract>
      <interface>
        <export-providerConfigRepo PURPOSE="Expose provider config repository API" />
      </interface>
      <depends>M-DB</depends>
    </M-PROVIDER-PERSIST>
  </Modules>
  <ImplementationOrder>
    <Phase-1 name="Foundation" status="done">
      <step-1 module="M-DB" status="done">Set up the shared database surface.</step-1>
      <step-2 module="M-PROVIDER-PERSIST" status="done" verification="V-M-PROVIDER-PERSIST">Persist provider config.</step-2>
    </Phase-1>
  </ImplementationOrder>
</DevelopmentPlan>`,
  );

  writeProjectFile(
    root,
    "docs/knowledge-graph.xml",
    `<KnowledgeGraph>
  <Project NAME="Example" VERSION="0.1.0">
    <M-DB NAME="DatabaseCore" TYPE="DATA_LAYER" STATUS="implemented">
      <purpose>Provide a shared database client.</purpose>
      <path>src/db</path>
      <depends>none</depends>
      <annotations>
        <export-db PURPOSE="Expose shared db client" />
      </annotations>
    </M-DB>
    <M-PROVIDER-PERSIST NAME="ProviderConfigPersistence" TYPE="DATA_LAYER" STATUS="implemented">
      <purpose>Persist provider configuration records.</purpose>
      <path>src/provider</path>
      <depends>M-DB</depends>
      <annotations>
        <fn-getProviderConfig PURPOSE="Read provider config from storage" />
        <export-providerConfigRepo PURPOSE="Provider config repository API" />
      </annotations>
    </M-PROVIDER-PERSIST>
  </Project>
</KnowledgeGraph>`,
  );

  writeProjectFile(
    root,
    "docs/verification-plan.xml",
    `<VerificationPlan VERSION="0.1.0">
  <ModuleVerification>
    <V-M-PROVIDER-PERSIST MODULE="M-PROVIDER-PERSIST" PRIORITY="high">
      <test-files>
        <file>src/provider/config-repo.test.ts</file>
      </test-files>
      <module-checks>
        <check-1>bun test src/provider</check-1>
      </module-checks>
      <scenarios>
        <scenario-1 kind="success">Reads and writes provider config records.</scenario-1>
      </scenarios>
      <required-log-markers>
        <marker-1>[ProviderConfigPersistence][getProviderConfig][BLOCK_GET_PROVIDER_CONFIG]</marker-1>
      </required-log-markers>
      <required-trace-assertions>
        <assertion-1>Failures should not emit success log markers.</assertion-1>
      </required-trace-assertions>
      <wave-follow-up>Exercise provider configuration through the server shell.</wave-follow-up>
      <phase-follow-up>Run workspace provider checks.</phase-follow-up>
    </V-M-PROVIDER-PERSIST>
  </ModuleVerification>
</VerificationPlan>`,
  );
}

function writeGovernedFiles(root: string) {
  writeProjectFile(
    root,
    "src/db/index.ts",
    `// START_MODULE_CONTRACT
//   PURPOSE: Expose the shared database surface
//   SCOPE: Provide the shared db client singleton
//   DEPENDS: none
//   LINKS: M-DB
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   db - Shared database client export
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v0.1.0 - Added shared database entrypoint]
// END_CHANGE_SUMMARY
export const db = {};
`,
  );

  writeProjectFile(
    root,
    "src/provider/config-repo.ts",
    `// START_MODULE_CONTRACT
//   PURPOSE: Persist and retrieve provider configuration records
//   SCOPE: Read and write singleton provider config rows
//   DEPENDS: drizzle-orm, M-DB
//   LINKS: M-PROVIDER-PERSIST, M-DB
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getProviderConfig - Fetch provider configuration
//   providerConfigRepo - Repository API object
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v0.1.0 - Added provider config repository]
// END_CHANGE_SUMMARY
//
// START_CONTRACT: getProviderConfig
//   PURPOSE: Read provider configuration from storage
//   INPUTS: none
//   OUTPUTS: { Promise<object> }
//   SIDE_EFFECTS: Reads from storage
//   LINKS: M-PROVIDER-PERSIST, M-DB
// END_CONTRACT: getProviderConfig
export async function getProviderConfig() {
  // START_BLOCK_GET_PROVIDER_CONFIG
  return { ok: true };
  // END_BLOCK_GET_PROVIDER_CONFIG
}
//
// START_CONTRACT: providerConfigRepo
//   PURPOSE: Expose repository operations as a stable API surface
//   INPUTS: none
//   OUTPUTS: { object }
//   SIDE_EFFECTS: none
//   LINKS: M-PROVIDER-PERSIST
// END_CONTRACT: providerConfigRepo
export const providerConfigRepo = { getProviderConfig };
`,
  );
}

function createQueryProject() {
  const root = createProject();
  writeQueryDocs(root);
  writeGovernedFiles(root);
  return root;
}

describe("grace query core", () => {
  it("loads shared-doc and file-local module context into one index", () => {
    const root = createQueryProject();
    const index = loadGraceArtifactIndex(root);

    const providerModule = resolveModule(index, "M-PROVIDER-PERSIST");
    expect(providerModule.plan?.contract.purpose).toBe("Persist provider configuration records.");
    expect(providerModule.graph?.path).toBe("src/provider");
    expect(providerModule.verifications.map((entry) => entry.id)).toEqual(["V-M-PROVIDER-PERSIST"]);
    expect(providerModule.localFiles.map((file) => file.path)).toEqual(["src/provider/config-repo.ts"]);
    expect(providerModule.steps.map((step) => step.stepTag)).toEqual(["step-2"]);
  });

  it("finds modules through both shared-doc fields and file-local paths", () => {
    const root = createQueryProject();
    const index = loadGraceArtifactIndex(root);

    const pathMatches = findModules(index, { query: "src/provider/config-repo.ts" });
    expect(pathMatches[0]?.module.id).toBe("M-PROVIDER-PERSIST");
    expect(pathMatches.some((match) => match.module.id === "M-DB")).toBe(true);

    const filteredMatches = findModules(index, {
      type: "DATA_LAYER",
      dependsOn: "M-DB",
    });
    expect(filteredMatches.map((match) => match.module.id)).toEqual(["M-PROVIDER-PERSIST"]);
  });

  it("resolves module show targets by choosing the most specific owning module path", () => {
    const root = createQueryProject();
    const index = loadGraceArtifactIndex(root);

    const providerModule = resolveModule(index, "src/provider/config-repo.ts");
    expect(providerModule.id).toBe("M-PROVIDER-PERSIST");
  });

  it("parses file-local contracts and blocks for file show", () => {
    const root = createQueryProject();
    const index = loadGraceArtifactIndex(root);

    const fileRecord = resolveGovernedFile(index, "src/provider/config-repo.ts");
    expect(fileRecord.linkedModuleIds).toEqual(["M-PROVIDER-PERSIST", "M-DB"]);
    expect(fileRecord.moduleMap.map((item) => item.label)).toEqual([
      "getProviderConfig - Fetch provider configuration",
      "providerConfigRepo - Repository API object",
    ]);
    expect(fileRecord.contracts.map((contract) => contract.name)).toEqual(["getProviderConfig", "providerConfigRepo"]);
    expect(fileRecord.blocks.map((block) => block.name)).toEqual(["GET_PROVIDER_CONFIG"]);
  });

  it("wires module and file query commands through the CLI", () => {
    const root = createQueryProject();
    const repoRoot = path.resolve(import.meta.dir, "..");

    const moduleResult = Bun.spawnSync({
      cmd: [process.execPath, "run", "./src/grace.ts", "module", "find", "provider", "--path", root],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(moduleResult.exitCode).toBe(0);
    expect(Buffer.from(moduleResult.stdout).toString("utf8")).toContain("M-PROVIDER-PERSIST");

    const fileResult = Bun.spawnSync({
      cmd: [process.execPath, "run", "./src/grace.ts", "file", "show", "src/provider/config-repo.ts", "--path", root, "--contracts"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(fileResult.exitCode).toBe(0);
    expect(Buffer.from(fileResult.stdout).toString("utf8")).toContain("Contract getProviderConfig");
  });
});
