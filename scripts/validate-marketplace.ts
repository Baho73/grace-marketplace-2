import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type JsonObject = Record<string, unknown>;

type ValidationResult = {
  scopeLabel: string;
  checkedPlugins: string[];
  errors: string[];
  warnings: string[];
  hardcodedPathWarnings: string[];
};

const repoRoot = process.cwd();
const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
const readmePath = path.join(repoRoot, "README.md");

function readJson(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonObject;
}

function fileExists(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function normalizeMultiline(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function sameJson(left: JsonObject, right: JsonObject): boolean {
  return normalizeMultiline(JSON.stringify(left, null, 2)) === normalizeMultiline(JSON.stringify(right, null, 2));
}

function getChangedPluginNames(): string[] | null {
  const result = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  const changedFiles = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (changedFiles.length === 0) {
    return null;
  }

  const pluginNames = new Set<string>();

  for (const file of changedFiles) {
    const match = file.match(/^plugins\/([^/]+)\//);
    if (match) {
      pluginNames.add(match[1]);
    }
  }

  return pluginNames.size > 0 ? [...pluginNames].sort() : null;
}

function getReadmeVersion(): string | null {
  const readme = readFileSync(readmePath, "utf8");
  const match = readme.match(/Current packaged version:\s*`([^`]+)`/);
  return match?.[1] ?? null;
}

function validateRequiredFields(
  pluginName: string,
  sourceName: string,
  source: JsonObject,
  fields: string[],
  errors: string[],
) {
  for (const field of fields) {
    const value = source[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${pluginName}: missing required field "${field}" in ${sourceName}`);
    }
  }
}

function compareSharedFields(
  pluginName: string,
  leftName: string,
  left: JsonObject,
  rightName: string,
  right: JsonObject,
  fields: string[],
  errors: string[],
) {
  for (const field of fields) {
    if ((left[field] ?? null) !== (right[field] ?? null)) {
      errors.push(
        `${pluginName}: ${field} mismatch between ${leftName} (${JSON.stringify(left[field] ?? null)}) and ${rightName} (${JSON.stringify(right[field] ?? null)})`,
      );
    }
  }
}

function collectHardcodedPathWarnings(dirPath: string, warnings: string[]) {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(repoRoot, entryPath);

    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      collectHardcodedPathWarnings(entryPath, warnings);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!relativePath.endsWith(".sh") && !relativePath.endsWith(".ts")) {
      continue;
    }

    const content = readFileSync(entryPath, "utf8");
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      if (/\/home\/[A-Za-z]/.test(lines[index]) || /\/Users\/[A-Za-z]/.test(lines[index])) {
        warnings.push(`${relativePath}:${index + 1}: ${lines[index].trim()}`);
      }
    }
  }
}

function validate(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hardcodedPathWarnings: string[] = [];

  const marketplace = readJson(marketplacePath);
  const pluginEntries = Array.isArray(marketplace.plugins) ? (marketplace.plugins as JsonObject[]) : [];
  const changedPluginNames = getChangedPluginNames();

  const scopedEntries = changedPluginNames
    ? pluginEntries.filter((entry) => entry.name && changedPluginNames.includes(String(entry.name)))
    : pluginEntries;

  if (pluginEntries.length === 0) {
    errors.push("marketplace.json: no plugins declared");
  }

  if (changedPluginNames && scopedEntries.length === 0) {
    warnings.push(`No marketplace plugins matched changed plugin scope: ${changedPluginNames.join(", ")}`);
  }

  const readmeVersion = getReadmeVersion();
  if (!readmeVersion) {
    errors.push('README.md: missing "Current packaged version: `x.y.z`" marker');
  }

  for (const entry of scopedEntries) {
    const pluginName = String(entry.name ?? "");
    const source = String(entry.source ?? "");

    if (!pluginName) {
      errors.push("marketplace.json: plugin entry missing name");
      continue;
    }

    if (!source) {
      errors.push(`${pluginName}: marketplace entry missing source`);
      continue;
    }

    validateRequiredFields(pluginName, "marketplace.json", entry, ["name", "version", "description"], errors);

    const pluginDir = path.resolve(repoRoot, source);
    const manifestPath = path.join(pluginDir, "plugin.json");
    const compatibilityManifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");

    if (!fileExists(manifestPath)) {
      errors.push(`${pluginName}: missing plugin manifest at ${path.relative(repoRoot, manifestPath)}`);
      continue;
    }

    if (!fileExists(compatibilityManifestPath)) {
      errors.push(`${pluginName}: missing compatibility manifest at ${path.relative(repoRoot, compatibilityManifestPath)}`);
      continue;
    }

    const pluginManifest = readJson(manifestPath);
    const compatibilityManifest = readJson(compatibilityManifestPath);
    const hasExplicitComponents =
      (Array.isArray(entry.skills) && entry.skills.length > 0) ||
      (Array.isArray(entry.agents) && entry.agents.length > 0);
    const entryStrict = entry.strict === true;

    validateRequiredFields(pluginName, "plugin.json", pluginManifest, ["name", "version", "description"], errors);
    validateRequiredFields(pluginName, ".claude-plugin/plugin.json", compatibilityManifest, ["name", "version", "description"], errors);

    if (hasExplicitComponents && !entryStrict) {
      errors.push(
        `${pluginName}: marketplace entry defines components via skills/agents and must set strict: true to avoid manifest conflicts`,
      );
    }

    compareSharedFields(
      pluginName,
      "marketplace.json",
      entry,
      "plugin.json",
      pluginManifest,
      ["name", "version", "description", "license"],
      errors,
    );
    compareSharedFields(
      pluginName,
      "plugin.json",
      pluginManifest,
      ".claude-plugin/plugin.json",
      compatibilityManifest,
      ["name", "version", "description", "license"],
      errors,
    );

    if (!sameJson(pluginManifest, compatibilityManifest)) {
      errors.push(`${pluginName}: plugin.json and .claude-plugin/plugin.json differ`);
    }

    const version = String(entry.version ?? "");
    if (readmeVersion && version && readmeVersion !== version) {
      errors.push(`${pluginName}: version mismatch between marketplace.json (${version}) and README.md (${readmeVersion})`);
    }

    const compatibilityDir = path.dirname(compatibilityManifestPath);
    const extraFiles = readdirSync(compatibilityDir).filter((fileName) => fileName !== "plugin.json");
    if (extraFiles.length > 0) {
      errors.push(`${pluginName}: extra files in ${path.relative(repoRoot, compatibilityDir)} (${extraFiles.join(", ")})`);
    }
  }

  collectHardcodedPathWarnings(repoRoot, hardcodedPathWarnings);

  return {
    scopeLabel: changedPluginNames ? changedPluginNames.join(", ") : "all",
    checkedPlugins: scopedEntries.map((entry) => String(entry.name ?? "")).filter(Boolean),
    errors,
    warnings,
    hardcodedPathWarnings,
  };
}

function printResult(result: ValidationResult) {
  const hasFailures = result.errors.length > 0;
  const hasHardcodedPathWarnings = result.hardcodedPathWarnings.length > 0;

  console.log("## Validation Result");
  console.log(`**Status**: ${hasFailures ? "FAIL" : "PASS"}`);
  console.log(`**Scope**: ${result.scopeLabel}`);
  console.log("### Checks");
  console.log(`- [${result.errors.some((error) => error.includes("mismatch")) || result.errors.some((error) => error.includes("missing compatibility manifest")) ? " " : "x"}] Marketplace sync`);
  console.log(`- [${result.errors.some((error) => error.includes("version mismatch")) || result.errors.some((error) => error.includes('missing "Current packaged version')) ? " " : "x"}] Version consistency`);
  console.log(`- [${result.errors.some((error) => error.includes('missing required field')) ? " " : "x"}] Required fields`);
  console.log(`- [${result.errors.some((error) => error.includes("extra files in")) ? " " : "x"}] Structure (single plugin.json)`);
  console.log(`- [${hasHardcodedPathWarnings ? " " : "x"}] No hardcoded paths`);

  if (result.errors.length > 0) {
    console.log("### Errors");
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }

  if (result.hardcodedPathWarnings.length > 0) {
    console.log("### Warnings");
    for (const warning of result.hardcodedPathWarnings) {
      console.log(`- ${warning}`);
    }
  } else if (result.warnings.length > 0) {
    console.log("### Warnings");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

  process.exitCode = hasFailures ? 1 : 0;
}

printResult(validate());
