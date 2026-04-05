#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineCommand, type CommandDef, runMain } from "citty";

export type LintSeverity = "error" | "warning";

export type LintIssue = {
  severity: LintSeverity;
  code: string;
  file: string;
  line?: number;
  message: string;
};

export type LintResult = {
  root: string;
  filesChecked: number;
  governedFiles: number;
  xmlFilesChecked: number;
  issues: LintIssue[];
};

export type LintOptions = {
  allowMissingDocs?: boolean;
};

const REQUIRED_DOCS = [
  "docs/knowledge-graph.xml",
  "docs/development-plan.xml",
  "docs/verification-plan.xml",
] as const;

const OPTIONAL_PACKET_DOC = "docs/operational-packets.xml";

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
]);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

const TS_LIKE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
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

const TEXT_FORMAT_OPTIONS = new Set(["text", "json"]);

function normalizeRelative(root: string, filePath: string) {
  return path.relative(root, filePath) || ".";
}

function lineNumberAt(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}

function addIssue(result: LintResult, issue: LintIssue) {
  result.issues.push(issue);
}

function readTextIfExists(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function collectCodeFiles(root: string, currentDir = root): string[] {
  const files: string[] = [];
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      files.push(...collectCodeFiles(root, path.join(currentDir, entry.name)));
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
  return searchable.split("\n").some((line) => /^(\s*)(\/\/|#|--|\*)\s*(START_MODULE_CONTRACT|START_MODULE_MAP|START_CONTRACT:|START_BLOCK_|START_CHANGE_SUMMARY)/.test(line));
}

function ensureSectionPair(
  result: LintResult,
  root: string,
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

  const sectionStart = startIndex + startMarker.length;
  return text.slice(sectionStart, endIndex);
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

function parseModuleMapEntries(section: string) {
  const entries = new Set<string>();
  const lines = section.split("\n");

  for (const line of lines) {
    const cleaned = line.replace(/^\s*(\/\/|#|--|\*)?\s*/, "").trim();
    if (!cleaned) {
      continue;
    }

    const match = cleaned.match(/^([A-Za-z_$][\w$]*)\s+-\s+/);
    if (match?.[1]) {
      entries.add(match[1]);
    }
  }

  return entries;
}

function extractTypeScriptExports(text: string) {
  const exports = new Set<string>();
  const directPatterns = [
    /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  ];

  for (const pattern of directPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        exports.add(match[1]);
      }
    }
  }

  for (const match of text.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const name of names) {
      const aliasMatch = name.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!aliasMatch) {
        continue;
      }

      exports.add(aliasMatch[2] ?? aliasMatch[1]);
    }
  }

  return exports;
}

function lintGovernedFile(result: LintResult, root: string, filePath: string, text: string) {
  const relativePath = normalizeRelative(root, filePath);
  result.governedFiles += 1;

  const moduleContract = ensureSectionPair(
    result,
    root,
    relativePath,
    text,
    "START_MODULE_CONTRACT",
    "END_MODULE_CONTRACT",
    "markup.missing-module-contract",
    "Governed files must include a paired MODULE_CONTRACT section.",
  );
  const moduleMap = ensureSectionPair(
    result,
    root,
    relativePath,
    text,
    "START_MODULE_MAP",
    "END_MODULE_MAP",
    "markup.missing-module-map",
    "Governed files must include a paired MODULE_MAP section.",
  );
  const changeSummary = ensureSectionPair(
    result,
    root,
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

  if (moduleContract && !/PURPOSE:|SCOPE:|DEPENDS:|LINKS:/s.test(moduleContract)) {
    addIssue(result, {
      severity: "error",
      code: "markup.incomplete-module-contract",
      file: relativePath,
      message: "MODULE_CONTRACT should include PURPOSE, SCOPE, DEPENDS, and LINKS fields.",
    });
  }

  const moduleMapEntries = moduleMap ? parseModuleMapEntries(moduleMap) : new Set<string>();
  if (moduleMap && moduleMapEntries.size === 0) {
    addIssue(result, {
      severity: "error",
      code: "markup.empty-module-map",
      file: relativePath,
      message: "MODULE_MAP must list at least one exported symbol and description.",
    });
  }

  if (changeSummary && !/LAST_CHANGE:/s.test(changeSummary)) {
    addIssue(result, {
      severity: "error",
      code: "markup.empty-change-summary",
      file: relativePath,
      message: "CHANGE_SUMMARY must contain at least one LAST_CHANGE entry.",
    });
  }

  if (TS_LIKE_EXTENSIONS.has(path.extname(filePath))) {
    const actualExports = extractTypeScriptExports(text);
    for (const exportName of actualExports) {
      if (!moduleMapEntries.has(exportName)) {
        addIssue(result, {
          severity: "error",
          code: "markup.module-map-missing-export",
          file: relativePath,
          message: `MODULE_MAP is missing the exported symbol \`${exportName}\`.`,
        });
      }
    }

    for (const mapEntry of moduleMapEntries) {
      if (!actualExports.has(mapEntry)) {
        addIssue(result, {
          severity: "warning",
          code: "markup.module-map-extra-export",
          file: relativePath,
          message: `MODULE_MAP lists \`${mapEntry}\`, but no matching TypeScript export was found.`,
        });
      }
    }
  }
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
  return new Set(
    Array.from(text.matchAll(/<(M-[A-Za-z0-9-]+)(?=[\s>])/g), (match) => match[1]),
  );
}

function extractVerificationIds(text: string) {
  return new Set(
    Array.from(text.matchAll(/<(V-M-[A-Za-z0-9-]+)(?=[\s>])/g), (match) => match[1]),
  );
}

function extractVerificationRefs(text: string) {
  return Array.from(text.matchAll(/<verification-ref>\s*([^<\s]+)\s*<\/verification-ref>/g)).map((match) => ({
    value: match[1],
    line: match.index === undefined ? undefined : lineNumberAt(text, match.index),
  }));
}

function extractStepRefs(text: string) {
  return Array.from(
    text.matchAll(/<(step-[A-Za-z0-9-]+)([^>]*)>/g),
    (match) => {
      const attrs = match[2] ?? "";
      const moduleMatch = attrs.match(/module="([^"]+)"/);
      const verificationMatch = attrs.match(/verification="([^"]+)"/);
      return {
        stepTag: match[1],
        moduleId: moduleMatch?.[1] ?? null,
        verificationId: verificationMatch?.[1] ?? null,
        line: match.index === undefined ? undefined : lineNumberAt(text, match.index),
      };
    },
  );
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

export function lintGraceProject(projectRoot: string, options: LintOptions = {}): LintResult {
  const root = path.resolve(projectRoot);
  const result: LintResult = {
    root,
    filesChecked: 0,
    governedFiles: 0,
    xmlFilesChecked: 0,
    issues: [],
  };

  const docs = Object.fromEntries(
    REQUIRED_DOCS.map((relativePath) => [relativePath, readTextIfExists(path.join(root, relativePath))]),
  ) as Record<(typeof REQUIRED_DOCS)[number], string | null>;
  const operationalPackets = readTextIfExists(path.join(root, OPTIONAL_PACKET_DOC));

  if (!options.allowMissingDocs) {
    for (const relativePath of REQUIRED_DOCS) {
      if (!docs[relativePath]) {
        addIssue(result, {
          severity: "error",
          code: "docs.missing-required-artifact",
          file: relativePath,
          message: `Missing required GRACE artifact \`${relativePath}\`.`,
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

      if (step.verificationId && !verificationIds.has(step.verificationId)) {
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

  for (const filePath of collectCodeFiles(root)) {
    result.filesChecked += 1;
    const text = readFileSync(filePath, "utf8");
    if (!hasGraceMarkers(text)) {
      continue;
    }

    lintGovernedFile(result, root, filePath, text);
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

export const lintCommand = defineCommand({
  meta: {
    name: "lint",
    description: "Lint GRACE artifacts, XML tag conventions, and semantic markup.",
  },
  args: {
    path: {
      type: "string",
      alias: "p",
      description: "Project root to lint",
      default: ".",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: text or json",
      default: "text",
    },
    allowMissingDocs: {
      type: "boolean",
      description: "Allow repositories that do not yet have full GRACE docs",
      default: false,
    },
  },
  async run(context) {
    const format = String(context.args.format ?? "text");
    if (!TEXT_FORMAT_OPTIONS.has(format)) {
      throw new Error(`Unsupported format \`${format}\`. Use \`text\` or \`json\`.`);
    }

    const result = lintGraceProject(String(context.args.path ?? "."), {
      allowMissingDocs: Boolean(context.args.allowMissingDocs),
    });

    if (format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatTextReport(result)}\n`);
    }

    process.exitCode = result.issues.some((issue) => issue.severity === "error") ? 1 : 0;
  },
});

if (import.meta.main) {
  await runMain(lintCommand as CommandDef);
}
