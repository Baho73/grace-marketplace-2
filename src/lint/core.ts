import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { loadGraceLintConfig } from "./config";
import { getLanguageAdapter } from "./adapters/base";
import { lintSkillSections } from "./skill-sections";
import type {
  GraceLintConfig,
  LanguageAnalysis,
  LintIssue,
  LintOptions,
  LintResult,
  MapMode,
  MarkupSection,
  ModuleContractInfo,
  ModuleMapItem,
  ModuleRole,
} from "./types";

const REQUIRED_DOCS = ["docs/knowledge-graph.xml", "docs/development-plan.xml", "docs/verification-plan.xml"] as const;

const OPTIONAL_PACKET_DOC = "docs/operational-packets.xml";
const LINT_CONFIG_FILE = ".grace-lint.json";
const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

const CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".pyi",
  ".go",
  ".java",
  ".kt",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".scala",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".clj",
  ".cljs",
  ".cljc",
]);

const UNIQUE_TAG_ANTI_PATTERNS = [
  {
    code: "xml.generic-module-tag",
    regex: /<\/?Module(?=[\s>])/g,
    message: 'Use unique module tags like `<M-AUTH>` instead of generic `<Module ID="...">`.',
  },
  {
    code: "xml.generic-phase-tag",
    regex: /<\/?Phase(?=[\s>])/g,
    message: 'Use unique phase tags like `<Phase-1>` instead of generic `<Phase number="...">`.',
  },
  {
    code: "xml.generic-flow-tag",
    regex: /<\/?Flow(?=[\s>])/g,
    message: 'Use unique flow tags like `<DF-LOGIN>` instead of generic `<Flow ID="...">`.',
  },
  {
    code: "xml.generic-use-case-tag",
    regex: /<\/?UseCase(?=[\s>])/g,
    message: 'Use unique use-case tags like `<UC-001>` instead of generic `<UseCase ID="...">`.',
  },
  {
    code: "xml.generic-step-tag",
    regex: /<\/?step(?=[\s>])/g,
    message: 'Use unique step tags like `<step-1>` instead of generic `<step order="...">`.',
  },
  {
    code: "xml.generic-export-tag",
    regex: /<\/?export(?=[\s>])/g,
    message: 'Use unique export tags like `<export-run>` instead of generic `<export name="...">`.',
  },
  {
    code: "xml.generic-function-tag",
    regex: /<\/?function(?=[\s>])/g,
    message: 'Use unique function tags like `<fn-run>` instead of generic `<function name="...">`.',
  },
  {
    code: "xml.generic-type-tag",
    regex: /<\/?type(?=[\s>])/g,
    message: 'Use unique type tags like `<type-Result>` instead of generic `<type name="...">`.',
  },
];

const VALID_ROLES = new Set<ModuleRole>(["RUNTIME", "TEST", "BARREL", "CONFIG", "TYPES", "SCRIPT"]);
const VALID_MAP_MODES = new Set<MapMode>(["EXPORTS", "LOCALS", "SUMMARY", "NONE"]);
const TEXT_FORMAT_OPTIONS = new Set(["text", "json"]);

function normalizeRelative(root: string, filePath: string) {
  return path.relative(root, filePath) || ".";
}

function lineNumberAt(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}

function readTextIfExists(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function addIssue(result: LintResult, issue: LintIssue) {
  result.issues.push(issue);
}

function stripQuotedStrings(text: string) {
  let result = "";
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (const char of text) {
    if (!quote) {
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        result += " ";
        continue;
      }

      result += char;
      continue;
    }

    if (escaped) {
      escaped = false;
      result += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "\\") {
      escaped = true;
      result += " ";
      continue;
    }

    if (char === quote) {
      quote = null;
      result += " ";
      continue;
    }

    result += char === "\n" ? "\n" : " ";
  }

  return result;
}

function hasGraceMarkers(text: string) {
  const searchable = stripQuotedStrings(text);
  return searchable.split("\n").some((line) => /^(\s*)(\/\/|#|--|;+|\*)\s*(START_MODULE_CONTRACT|START_MODULE_MAP|START_CONTRACT:|START_BLOCK_|START_CHANGE_SUMMARY)/.test(line));
}

function collectCodeFiles(root: string, config: GraceLintConfig | null, currentDir = root): string[] {
  const files: string[] = [];
  const ignoredDirs = new Set([...DEFAULT_IGNORED_DIRS, ...(config?.ignoredDirs ?? [])]);
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }

      files.push(...collectCodeFiles(root, config, path.join(currentDir, entry.name)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(currentDir, entry.name);
    if (CODE_EXTENSIONS.has(path.extname(filePath))) {
      files.push(filePath);
    }
  }

  return files;
}

function stripCommentPrefix(line: string) {
  return line.replace(/^\s*(\/\/|#|--|;+|\*)?\s*/, "");
}

function findSection(text: string, startMarker: string, endMarker: string) {
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return null;
  }

  return {
    content: text.slice(startIndex + startMarker.length, endIndex),
    startLine: lineNumberAt(text, startIndex),
    endLine: lineNumberAt(text, endIndex),
  } satisfies MarkupSection;
}

function ensureSectionPair(
  result: LintResult,
  relativePath: string,
  text: string,
  startMarker: string,
  endMarker: string,
  code: string,
  message: string,
) {
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    addIssue(result, {
      severity: "error",
      code,
      file: relativePath,
      line: startIndex === -1 ? undefined : lineNumberAt(text, startIndex),
      message,
    });
    return null;
  }

  if (startIndex > endIndex) {
    addIssue(result, {
      severity: "error",
      code,
      file: relativePath,
      line: lineNumberAt(text, endIndex),
      message: `${message} Found the end marker before the start marker.`,
    });
    return null;
  }

  return {
    content: text.slice(startIndex + startMarker.length, endIndex),
    startLine: lineNumberAt(text, startIndex),
    endLine: lineNumberAt(text, endIndex),
  } satisfies MarkupSection;
}

function lintScopedMarkers(
  result: LintResult,
  relativePath: string,
  text: string,
  startRegex: RegExp,
  endRegex: RegExp,
  kind: "block" | "contract",
) {
  const lines = text.split("\n");
  const stack: Array<{ name: string; line: number }> = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const startMatch = line.match(startRegex);
    const endMatch = line.match(endRegex);

    if (startMatch?.[1]) {
      const name = startMatch[1];
      if (kind === "block") {
        if (seen.has(name)) {
          addIssue(result, {
            severity: "error",
            code: "markup.duplicate-block-name",
            file: relativePath,
            line: index + 1,
            message: `Semantic block name \`${name}\` is duplicated in this file.`,
          });
        }

        seen.add(name);
      }

      stack.push({ name, line: index + 1 });
    }

    if (endMatch?.[1]) {
      const name = endMatch[1];
      const active = stack[stack.length - 1];

      if (!active) {
        addIssue(result, {
          severity: "error",
          code: kind === "block" ? "markup.unmatched-block-end" : "markup.unmatched-contract-end",
          file: relativePath,
          line: index + 1,
          message: `Found an unmatched END marker for \`${name}\`.`,
        });
        continue;
      }

      if (active.name !== name) {
        addIssue(result, {
          severity: "error",
          code: kind === "block" ? "markup.mismatched-block-end" : "markup.mismatched-contract-end",
          file: relativePath,
          line: index + 1,
          message: `Expected END marker for \`${active.name}\`, found \`${name}\` instead.`,
        });
        continue;
      }

      stack.pop();
    }
  }

  for (const active of stack) {
    addIssue(result, {
      severity: "error",
      code: kind === "block" ? "markup.missing-block-end" : "markup.missing-contract-end",
      file: relativePath,
      line: active.line,
      message: `Missing END marker for \`${active.name}\`.`,
    });
  }
}

function parseModuleContract(section: MarkupSection) {
  const fields: Record<string, string> = {};

  for (const line of section.content.split("\n")) {
    const cleaned = stripCommentPrefix(line).trim();
    if (!cleaned) {
      continue;
    }

    const match = cleaned.match(/^([A-Z_]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    fields[match[1]] = match[2].trim();
  }

  const roleValue = fields.ROLE?.toUpperCase() as ModuleRole | undefined;
  const mapModeValue = fields.MAP_MODE?.toUpperCase() as MapMode | undefined;

  return {
    fields,
    purpose: fields.PURPOSE,
    scope: fields.SCOPE,
    depends: fields.DEPENDS,
    links: fields.LINKS,
    role: roleValue && VALID_ROLES.has(roleValue) ? roleValue : undefined,
    mapMode: mapModeValue && VALID_MAP_MODES.has(mapModeValue) ? mapModeValue : undefined,
  } satisfies ModuleContractInfo;
}

function toSymbolName(label: string) {
  return /^(?:default|[A-Za-z_$][\w$]*)$/.test(label) ? label : undefined;
}

function parseModuleMapItems(section: MarkupSection) {
  const items: ModuleMapItem[] = [];
  const lines = section.content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const cleaned = stripCommentPrefix(lines[index]).trim();
    if (!cleaned) {
      continue;
    }

    const match = cleaned.match(/^(.+?)\s+-\s+.+$/);
    const label = (match?.[1] ?? cleaned).trim();
    items.push({
      label,
      symbolName: toSymbolName(label),
      line: section.startLine + index,
    });
  }

  return items;
}

function isBarrelLike(analysis: LanguageAnalysis) {
  return analysis.hasWildcardReExport || (analysis.directReExportCount > 0 && analysis.localImplementationCount <= 2);
}

function isAggregationSurface(analysis: LanguageAnalysis) {
  return isBarrelLike(analysis) || (analysis.directReExportCount >= 2 && analysis.exports.size >= 8);
}

function inferRole(contract: ModuleContractInfo | null, analysis: LanguageAnalysis | null): ModuleRole {
  if (contract?.role) {
    return contract.role;
  }

  if (analysis?.usesTestFramework) {
    return "TEST";
  }

  const contractText = `${contract?.purpose ?? ""} ${contract?.scope ?? ""}`.toLowerCase();
  const mentionsTypes = /\b(type definition|type definitions|interface|interfaces|types?)\b/.test(contractText);
  const mentionsConfig = /\b(config|configure|configuration|settings?)\b/.test(contractText);
  const mentionsBarrel = /\b(barrel|re-export|re-exports|aggregate|entry point|bindings?)\b/.test(contractText);
  const mentionsScript = /\b(script|scripts|cli|command|commands|bootstrap|smoke|runner|execute|execution|setup|check)\b/.test(contractText);

  if (analysis && analysis.valueExports.size === 0 && analysis.typeExports.size > 0) {
    return "TYPES";
  }

  if (analysis && (mentionsBarrel || isBarrelLike(analysis))) {
    return "BARREL";
  }

  if (!analysis && mentionsTypes) {
    return "TYPES";
  }

  if (analysis && mentionsTypes && analysis.valueExports.size === 0) {
    return "TYPES";
  }

  if (analysis && mentionsConfig && analysis.hasDefaultExport && analysis.valueExports.size <= 1) {
    return "CONFIG";
  }

  if (analysis?.hasMainEntrypoint) {
    return "SCRIPT";
  }

  if (analysis && mentionsScript && analysis.exports.size === 0) {
    return "SCRIPT";
  }

  if (mentionsConfig && !analysis) {
    return "CONFIG";
  }

  if (!analysis && mentionsScript) {
    return "SCRIPT";
  }

  return "RUNTIME";
}

function inferMapMode(
  contract: ModuleContractInfo | null,
  role: ModuleRole,
  items: ModuleMapItem[],
  analysis: LanguageAnalysis | null,
) {
  if (contract?.mapMode) {
    return contract.mapMode;
  }

  if (role === "TEST") {
    return "LOCALS" as const;
  }

  if (role === "SCRIPT") {
    return "LOCALS" as const;
  }

  if (role === "BARREL") {
    return "SUMMARY" as const;
  }

  if (role === "CONFIG") {
    return "NONE" as const;
  }

  if (role === "TYPES") {
    return "EXPORTS" as const;
  }

  if (items.some((item) => !item.symbolName)) {
    return "SUMMARY" as const;
  }

  if (analysis && isAggregationSurface(analysis) && items.length > 0 && analysis.exports.size > items.length * 2) {
    return "SUMMARY" as const;
  }

  return "EXPORTS" as const;
}

function lintUniqueTags(result: LintResult, relativePath: string, text: string) {
  for (const antiPattern of UNIQUE_TAG_ANTI_PATTERNS) {
    for (const match of text.matchAll(antiPattern.regex)) {
      addIssue(result, {
        severity: "error",
        code: antiPattern.code,
        file: relativePath,
        line: match.index === undefined ? undefined : lineNumberAt(text, match.index),
        message: antiPattern.message,
      });
    }
  }
}

function extractModuleIds(text: string) {
  return new Set(Array.from(text.matchAll(/<(M-[A-Za-z0-9-]+)(?=[\s>])/g), (match) => match[1]));
}

function extractVerificationIds(text: string) {
  return new Set(Array.from(text.matchAll(/<(V-M-[A-Za-z0-9-]+)(?=[\s>])/g), (match) => match[1]));
}

function extractVerificationRefs(text: string) {
  return Array.from(text.matchAll(/<verification-ref>\s*([^<\s]+)\s*<\/verification-ref>/g)).map((match) => ({
    value: match[1],
    line: match.index === undefined ? undefined : lineNumberAt(text, match.index),
  }));
}

function extractStepRefs(text: string) {
  return Array.from(text.matchAll(/<(step-[A-Za-z0-9-]+)([^>]*)>/g), (match) => {
    const attrs = match[2] ?? "";
    const moduleMatch = attrs.match(/module="([^"]+)"/);
    const verificationMatch = attrs.match(/verification="([^"]+)"/);
    return {
      stepTag: match[1],
      moduleId: moduleMatch?.[1] ?? null,
      verificationId: verificationMatch?.[1] ?? null,
      line: match.index === undefined ? undefined : lineNumberAt(text, match.index),
    };
  });
}

function lintRequiredPacketSections(result: LintResult, relativePath: string, text: string) {
  const requiredTags = [
    "ExecutionPacketTemplate",
    "GraphDeltaTemplate",
    "VerificationDeltaTemplate",
    "FailurePacketTemplate",
  ];

  for (const tagName of requiredTags) {
    const pattern = new RegExp(`<${tagName}(?=[\\s>])`);
    if (!pattern.test(text)) {
      addIssue(result, {
        severity: "error",
        code: "packets.missing-template-section",
        file: relativePath,
        message: `Operational packet reference is missing <${tagName}>.`,
      });
    }
  }
}

function lintExportMapParity(
  result: LintResult,
  relativePath: string,
  items: ModuleMapItem[],
  analysis: LanguageAnalysis,
  role: ModuleRole,
  mapMode: MapMode,
) {
  if (mapMode !== "EXPORTS") {
    return;
  }

  const exportSeverity = analysis.exportConfidence === "exact" ? "error" : "warning";

  if (analysis.exportConfidence === "heuristic") {
    addIssue(result, {
      severity: "warning",
      code: "analysis.heuristic-export-surface",
      file: relativePath,
      message: `The ${analysis.adapterId} adapter inferred exports heuristically for this file. Exact MODULE_MAP parity may require explicit file ROLE/MAP_MODE or stronger language-specific export declarations.`,
    });
  }

  if (analysis.hasWildcardReExport) {
    addIssue(result, {
      severity: "warning",
      code: "analysis.wildcard-reexport-surface",
      file: relativePath,
      message: "This file uses wildcard re-exports. Exact export parity is skipped unless you use a more specific MAP_MODE or explicit barrel structure.",
    });
    return;
  }

  const mappedSymbols = new Set(items.flatMap((item) => (item.symbolName ? [item.symbolName] : [])));
  if (mappedSymbols.size === 0 && analysis.exports.size > 0) {
    addIssue(result, {
      severity: exportSeverity,
      code: "markup.module-map-missing-symbol-entries",
      file: relativePath,
      message: "MODULE_MAP should list concrete symbol names when MAP_MODE resolves to EXPORTS.",
    });
    return;
  }

  for (const exportName of analysis.exports) {
    if (!mappedSymbols.has(exportName)) {
      addIssue(result, {
        severity: exportSeverity,
        code: "markup.module-map-missing-export",
        file: relativePath,
        message: `MODULE_MAP is missing the exported symbol \`${exportName}\`.`,
      });
    }
  }

  for (const item of items) {
    if (!item.symbolName) {
      continue;
    }

    if (!analysis.exports.has(item.symbolName)) {
      addIssue(result, {
        severity: role === "RUNTIME" || role === "TYPES" ? "warning" : "warning",
        code: "markup.module-map-extra-export",
        file: relativePath,
        line: item.line,
        message: `MODULE_MAP lists \`${item.symbolName}\`, but no matching export was found by the ${analysis.adapterId} adapter.`,
      });
    }
  }
}

function lintGovernedFile(result: LintResult, root: string, filePath: string, text: string) {
  const relativePath = normalizeRelative(root, filePath);
  result.governedFiles += 1;

  const moduleContractSection = ensureSectionPair(
    result,
    relativePath,
    text,
    "START_MODULE_CONTRACT",
    "END_MODULE_CONTRACT",
    "markup.missing-module-contract",
    "Governed files must include a paired MODULE_CONTRACT section.",
  );
  const moduleMapSection = findSection(text, "START_MODULE_MAP", "END_MODULE_MAP");
  const changeSummarySection = ensureSectionPair(
    result,
    relativePath,
    text,
    "START_CHANGE_SUMMARY",
    "END_CHANGE_SUMMARY",
    "markup.missing-change-summary",
    "Governed files must include a paired CHANGE_SUMMARY section.",
  );

  lintScopedMarkers(
    result,
    relativePath,
    text,
    /START_CONTRACT:\s*([A-Za-z0-9_$.\-]+)/,
    /END_CONTRACT:\s*([A-Za-z0-9_$.\-]+)/,
    "contract",
  );
  lintScopedMarkers(
    result,
    relativePath,
    text,
    /START_BLOCK_([A-Za-z0-9_]+)/,
    /END_BLOCK_([A-Za-z0-9_]+)/,
    "block",
  );

  const contract = moduleContractSection ? parseModuleContract(moduleContractSection) : null;
  const mapItems = moduleMapSection ? parseModuleMapItems(moduleMapSection) : [];
  const adapter = getLanguageAdapter(filePath);
  let analysis: LanguageAnalysis | null = null;
  if (adapter) {
    try {
      analysis = adapter.analyze(filePath, text);
    } catch (error) {
      addIssue(result, {
        severity: "warning",
        code: "analysis.adapter-failed",
        file: relativePath,
        message: `${adapter.id} adapter failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const role = inferRole(contract, analysis);
  const mapMode = inferMapMode(contract, role, mapItems, analysis);

  if (moduleContractSection && contract) {
    const missingContractFields = ["PURPOSE", "SCOPE", "DEPENDS", "LINKS"].filter((field) => !contract.fields[field]);
    if (missingContractFields.length > 0) {
      addIssue(result, {
        severity: "error",
        code: "markup.incomplete-module-contract",
        file: relativePath,
        message: `MODULE_CONTRACT should include PURPOSE, SCOPE, DEPENDS, and LINKS fields. Missing: ${missingContractFields.join(", ")}.`,
      });
    }
  }

  if (moduleContractSection && contract?.fields.ROLE && !contract.role) {
    addIssue(result, {
      severity: "error",
      code: "markup.invalid-role",
      file: relativePath,
      message: `Unsupported ROLE \`${contract.fields.ROLE}\`. Use RUNTIME, TEST, BARREL, CONFIG, TYPES, or SCRIPT.`,
    });
  }

  if (moduleContractSection && contract?.fields.MAP_MODE && !contract.mapMode) {
    addIssue(result, {
      severity: "error",
      code: "markup.invalid-map-mode",
      file: relativePath,
      message: `Unsupported MAP_MODE \`${contract.fields.MAP_MODE}\`. Use EXPORTS, LOCALS, SUMMARY, or NONE.`,
    });
  }

  if (!moduleMapSection && mapMode !== "NONE") {
    addIssue(result, {
      severity: "error",
      code: "markup.missing-module-map",
      file: relativePath,
      message: `Governed files with ROLE ${role} and MAP_MODE ${mapMode} must include a paired MODULE_MAP section.`,
    });
  }

  if (moduleMapSection && mapMode !== "NONE" && mapItems.length === 0) {
    addIssue(result, {
      severity: "error",
      code: "markup.empty-module-map",
      file: relativePath,
      message: `MODULE_MAP must include at least one item when MAP_MODE resolves to ${mapMode}.`,
    });
  }

  if (changeSummarySection && !/LAST_CHANGE:/s.test(changeSummarySection.content)) {
    addIssue(result, {
      severity: "error",
      code: "markup.empty-change-summary",
      file: relativePath,
      message: "CHANGE_SUMMARY must contain at least one LAST_CHANGE entry.",
    });
  }

  if (analysis) {
    lintExportMapParity(result, relativePath, mapItems, analysis, role, mapMode);
  }
}

export function lintGraceProject(projectRoot: string, options: LintOptions = {}): LintResult {
  const root = path.resolve(projectRoot);
  const { config, issues: configIssues } = loadGraceLintConfig(root);

  const docs = {
    "docs/knowledge-graph.xml": readTextIfExists(path.join(root, "docs/knowledge-graph.xml")),
    "docs/development-plan.xml": readTextIfExists(path.join(root, "docs/development-plan.xml")),
    "docs/verification-plan.xml": readTextIfExists(path.join(root, "docs/verification-plan.xml")),
  } satisfies Record<string, string | null>;

  const result: LintResult = {
    root,
    filesChecked: 0,
    governedFiles: 0,
    xmlFilesChecked: 0,
    issues: [...configIssues],
  };

  if (configIssues.some((issue) => issue.severity === "error" && issue.file === LINT_CONFIG_FILE)) {
    return result;
  }

  if (!options.allowMissingDocs) {
    for (const relativePath of REQUIRED_DOCS) {
      if (!docs[relativePath]) {
        addIssue(result, {
          severity: "error",
          code: "docs.missing-required-artifact",
          file: relativePath,
          message: `Missing required current GRACE artifact \`${relativePath}\`.`,
        });
      }
    }
  }

  for (const [relativePath, contents] of Object.entries(docs)) {
    if (!contents) {
      continue;
    }

    result.xmlFilesChecked += 1;
    lintUniqueTags(result, relativePath, contents);
  }

  const operationalPackets = readTextIfExists(path.join(root, OPTIONAL_PACKET_DOC));
  if (operationalPackets) {
    result.xmlFilesChecked += 1;
    lintRequiredPacketSections(result, OPTIONAL_PACKET_DOC, operationalPackets);
  }

  const knowledgeGraph = docs["docs/knowledge-graph.xml"];
  const developmentPlan = docs["docs/development-plan.xml"];
  const verificationPlan = docs["docs/verification-plan.xml"];

  const graphModuleIds = knowledgeGraph ? extractModuleIds(knowledgeGraph) : new Set<string>();
  const planModuleIds = developmentPlan ? extractModuleIds(developmentPlan) : new Set<string>();
  const verificationIds = verificationPlan ? extractVerificationIds(verificationPlan) : new Set<string>();

  if (knowledgeGraph && verificationPlan) {
    for (const ref of extractVerificationRefs(knowledgeGraph)) {
      if (!verificationIds.has(ref.value)) {
        addIssue(result, {
          severity: "error",
          code: "graph.missing-verification-entry",
          file: "docs/knowledge-graph.xml",
          line: ref.line,
          message: `Knowledge graph references \`${ref.value}\`, but no matching verification entry exists.`,
        });
      }
    }
  }

  if (developmentPlan && verificationPlan) {
    for (const ref of extractVerificationRefs(developmentPlan)) {
      if (!verificationIds.has(ref.value)) {
        addIssue(result, {
          severity: "error",
          code: "plan.missing-verification-entry",
          file: "docs/development-plan.xml",
          line: ref.line,
          message: `Development plan references \`${ref.value}\`, but no matching verification entry exists.`,
        });
      }
    }

    for (const step of extractStepRefs(developmentPlan)) {
      if (step.moduleId && !planModuleIds.has(step.moduleId)) {
        addIssue(result, {
          severity: "error",
          code: "plan.step-missing-module",
          file: "docs/development-plan.xml",
          line: step.line,
          message: `${step.stepTag} references module \`${step.moduleId}\`, but no matching module tag exists in the plan.`,
        });
      }

      if (step.verificationId && verificationPlan && !verificationIds.has(step.verificationId)) {
        addIssue(result, {
          severity: "error",
          code: "plan.step-missing-verification",
          file: "docs/development-plan.xml",
          line: step.line,
          message: `${step.stepTag} references verification entry \`${step.verificationId}\`, but no matching tag exists in verification-plan.xml.`,
        });
      }
    }
  }

  if (knowledgeGraph && developmentPlan) {
    for (const moduleId of graphModuleIds) {
      if (!planModuleIds.has(moduleId)) {
        addIssue(result, {
          severity: "error",
          code: "graph.module-missing-from-plan",
          file: "docs/knowledge-graph.xml",
          message: `Module \`${moduleId}\` exists in the knowledge graph but not in the development plan.`,
        });
      }
    }

    for (const moduleId of planModuleIds) {
      if (!graphModuleIds.has(moduleId)) {
        addIssue(result, {
          severity: "error",
          code: "plan.module-missing-from-graph",
          file: "docs/development-plan.xml",
          message: `Module \`${moduleId}\` exists in the development plan but not in the knowledge graph.`,
        });
      }
    }
  }

  for (const filePath of collectCodeFiles(root, config)) {
    result.filesChecked += 1;
    const text = readFileSync(filePath, "utf8");
    if (!hasGraceMarkers(text)) {
      continue;
    }

    lintGovernedFile(result, root, filePath, text);
  }

  for (const issue of lintSkillSections(root)) {
    addIssue(result, issue);
  }

  return result;
}

export function formatTextReport(result: LintResult) {
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");
  const lines = [
    "GRACE Lint Report",
    "=================",
    `Root: ${result.root}`,
    `Code files checked: ${result.filesChecked}`,
    `Governed files checked: ${result.governedFiles}`,
    `XML files checked: ${result.xmlFilesChecked}`,
    `Issues: ${result.issues.length} (errors: ${errors.length}, warnings: ${warnings.length})`,
  ];

  if (errors.length > 0) {
    lines.push("", "Errors:");
    for (const issue of errors) {
      lines.push(`- [${issue.code}] ${issue.file}${issue.line ? `:${issue.line}` : ""} ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const issue of warnings) {
      lines.push(`- [${issue.code}] ${issue.file}${issue.line ? `:${issue.line}` : ""} ${issue.message}`);
    }
  }

  if (result.issues.length === 0) {
    lines.push("", "No GRACE integrity issues found.");
  }

  return lines.join("\n");
}

export function isValidTextFormat(format: string) {
  return TEXT_FORMAT_OPTIONS.has(format);
}
