import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { loadGraceLintConfig } from "../lint/config";
import type {
  FileBlockRecord,
  FileContractRecord,
  FileFieldSection,
  FileListItem,
  FileMarkupRecord,
  GraceArtifactIndex,
  ModuleFindOptions,
  ModuleGraphRecord,
  ModuleInterfaceItem,
  ModuleMatch,
  ModulePlanContract,
  ModulePlanParam,
  ModulePlanRecord,
  ModuleRecord,
  ModuleVerificationRecord,
  PlanStepRecord,
  VerificationScenario,
} from "./types";

const REQUIRED_DOCS = ["docs/knowledge-graph.xml", "docs/development-plan.xml", "docs/verification-plan.xml"] as const;

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

type XmlElement = {
  tag: string;
  attrs: Record<string, string>;
  text?: string;
};

type MarkupSection = {
  content: string;
  startLine: number;
  endLine: number;
};

function toPosixPath(filePath: string) {
  return filePath.replaceAll(path.sep, "/");
}

function normalizeRelative(root: string, filePath: string) {
  return toPosixPath(path.relative(root, filePath) || ".");
}

function normalizeInputPath(root: string, input: string) {
  const absolutePath = path.isAbsolute(input) ? path.normalize(input) : path.resolve(root, input);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return toPosixPath(relativePath);
  }

  return toPosixPath(input);
}

function lineNumberAt(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}

function decodeXmlEntities(text: string) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitList(text?: string) {
  if (!text) {
    return [];
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== "none");
}

function parseAttributes(attrText: string) {
  const attrs: Record<string, string> = {};
  for (const match of attrText.matchAll(/([A-Za-z_:][A-Za-z0-9_:-]*)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
  }

  return attrs;
}

function getAttr(attrs: Record<string, string>, name: string) {
  if (attrs[name] !== undefined) {
    return attrs[name];
  }

  const foundKey = Object.keys(attrs).find((key) => key.toLowerCase() === name.toLowerCase());
  return foundKey ? attrs[foundKey] : undefined;
}

function extractBlock(text: string, tag: string) {
  const match = text.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : undefined;
}

function extractTextChild(text: string, tag: string) {
  const block = extractBlock(text, tag);
  return block === undefined ? undefined : normalizeWhitespace(decodeXmlEntities(block));
}

function extractElements(text: string) {
  const elements: XmlElement[] = [];
  for (const match of text.matchAll(/<([A-Za-z][A-Za-z0-9-]*)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    elements.push({
      tag: match[1],
      attrs: parseAttributes(match[2] ?? ""),
      text: match[3] === undefined ? undefined : normalizeWhitespace(decodeXmlEntities(match[3])),
    });
  }

  return elements;
}

function parseInterfaceItems(block?: string) {
  if (!block) {
    return [] as ModuleInterfaceItem[];
  }

  return extractElements(block).map((element) => ({
    tag: element.tag,
    purpose: getAttr(element.attrs, "PURPOSE"),
    text: element.text,
  }));
}

function parseParamList(block?: string) {
  if (!block) {
    return [] as ModulePlanParam[];
  }

  return extractElements(block).map((element) => {
    const name = getAttr(element.attrs, "name");
    const type = getAttr(element.attrs, "type");
    const text = element.text ?? [name, type].filter(Boolean).join(": ");
    return {
      name,
      type,
      text: normalizeWhitespace(text),
    } satisfies ModulePlanParam;
  });
}

function parseErrorList(block?: string) {
  if (!block) {
    return [] as string[];
  }

  return extractElements(block)
    .map((element) => getAttr(element.attrs, "code") ?? element.text)
    .filter((value): value is string => Boolean(value));
}

function parsePlanContract(moduleBody: string): ModulePlanContract {
  const contractBlock = extractBlock(moduleBody, "contract") ?? "";
  return {
    purpose: extractTextChild(contractBlock, "purpose"),
    inputs: parseParamList(extractBlock(contractBlock, "inputs")),
    outputs: parseParamList(extractBlock(contractBlock, "outputs")),
    errors: parseErrorList(extractBlock(contractBlock, "errors")),
  };
}

function parsePlanModules(text: string) {
  const modules = new Map<string, ModulePlanRecord>();
  for (const match of text.matchAll(/<(M-[A-Za-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const id = match[1];
    const attrs = parseAttributes(match[2] ?? "");
    const body = match[3] ?? "";

    modules.set(id, {
      id,
      name: getAttr(attrs, "NAME"),
      type: getAttr(attrs, "TYPE"),
      layer: getAttr(attrs, "LAYER"),
      order: getAttr(attrs, "ORDER"),
      depends: splitList(extractTextChild(body, "depends")),
      contract: parsePlanContract(body),
      interfaceItems: parseInterfaceItems(extractBlock(body, "interface")),
    });
  }

  return modules;
}

function parseGraphModules(text: string) {
  const modules = new Map<string, ModuleGraphRecord>();
  for (const match of text.matchAll(/<(M-[A-Za-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const id = match[1];
    const attrs = parseAttributes(match[2] ?? "");
    const body = match[3] ?? "";

    modules.set(id, {
      id,
      name: getAttr(attrs, "NAME"),
      type: getAttr(attrs, "TYPE"),
      status: getAttr(attrs, "STATUS"),
      purpose: extractTextChild(body, "purpose"),
      path: extractTextChild(body, "path"),
      depends: splitList(extractTextChild(body, "depends")),
      annotations: parseInterfaceItems(extractBlock(body, "annotations")),
    });
  }

  return modules;
}

function parsePlanSteps(text: string) {
  const steps: PlanStepRecord[] = [];
  for (const phaseMatch of text.matchAll(/<(Phase-[A-Za-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const phaseTag = phaseMatch[1];
    const phaseAttrs = parseAttributes(phaseMatch[2] ?? "");
    const phaseBody = phaseMatch[3] ?? "";

    for (const stepMatch of phaseBody.matchAll(/<(step-[A-Za-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const stepAttrs = parseAttributes(stepMatch[2] ?? "");
      steps.push({
        phaseTag,
        phaseName: getAttr(phaseAttrs, "name"),
        phaseStatus: getAttr(phaseAttrs, "status"),
        stepTag: stepMatch[1],
        stepStatus: getAttr(stepAttrs, "status"),
        moduleId: getAttr(stepAttrs, "module"),
        verificationId: getAttr(stepAttrs, "verification"),
        text: normalizeWhitespace(decodeXmlEntities(stepMatch[3] ?? "")),
      });
    }
  }

  return steps;
}

function parseTextListBlock(block?: string) {
  if (!block) {
    return [] as string[];
  }

  return extractElements(block)
    .map((element) => element.text)
    .filter((value): value is string => Boolean(value));
}

function parseScenarioList(block?: string) {
  if (!block) {
    return [] as VerificationScenario[];
  }

  return extractElements(block)
    .map((element) => {
      if (!element.text) {
        return null;
      }

      return {
        tag: element.tag,
        kind: getAttr(element.attrs, "kind"),
        text: element.text,
      } satisfies VerificationScenario;
    })
    .filter((scenario): scenario is VerificationScenario => Boolean(scenario));
}

function parseVerificationEntries(text: string) {
  const entries: ModuleVerificationRecord[] = [];
  for (const match of text.matchAll(/<(V-M-[A-Za-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const id = match[1];
    const attrs = parseAttributes(match[2] ?? "");
    const body = match[3] ?? "";
    entries.push({
      id,
      moduleId: getAttr(attrs, "MODULE"),
      priority: getAttr(attrs, "PRIORITY"),
      testFiles: parseTextListBlock(extractBlock(body, "test-files")),
      moduleChecks: parseTextListBlock(extractBlock(body, "module-checks")),
      scenarios: parseScenarioList(extractBlock(body, "scenarios")),
      requiredLogMarkers: parseTextListBlock(extractBlock(body, "required-log-markers")),
      requiredTraceAssertions: parseTextListBlock(extractBlock(body, "required-trace-assertions")),
      waveFollowUp: extractTextChild(body, "wave-follow-up"),
      phaseFollowUp: extractTextChild(body, "phase-follow-up"),
    });
  }

  return entries;
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
  return searchable.split("\n").some((line) => /^\s*(\/\/|#|--|;+|\*)\s*(START_MODULE_CONTRACT|START_MODULE_MAP|START_CONTRACT:|START_BLOCK_|START_CHANGE_SUMMARY)/.test(line));
}

function collectCodeFiles(root: string, ignoredDirs: string[], currentDir = root): string[] {
  const files: string[] = [];
  const ignoredDirSet = new Set([...DEFAULT_IGNORED_DIRS, ...ignoredDirs]);
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirSet.has(entry.name)) {
        continue;
      }

      files.push(...collectCodeFiles(root, ignoredDirs, path.join(currentDir, entry.name)));
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

function parseFieldSection(section: MarkupSection | null): FileFieldSection | null {
  if (!section) {
    return null;
  }

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

  return {
    fields,
    startLine: section.startLine,
    endLine: section.endLine,
  };
}

function parseListSection(section: MarkupSection | null) {
  if (!section) {
    return [] as FileListItem[];
  }

  const items: FileListItem[] = [];
  const lines = section.content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const cleaned = stripCommentPrefix(lines[index]).trim();
    if (!cleaned) {
      continue;
    }

    items.push({
      label: cleaned,
      line: section.startLine + index,
    });
  }

  return items;
}

function parseScopedFieldSections(text: string) {
  const sections: FileContractRecord[] = [];
  for (const match of text.matchAll(/START_CONTRACT:\s*([A-Za-z0-9_$.\-]+)([\s\S]*?)END_CONTRACT:\s*\1/g)) {
    const content = match[2] ?? "";
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    const section = parseFieldSection({
      content,
      startLine: lineNumberAt(text, startIndex),
      endLine: lineNumberAt(text, endIndex),
    });
    sections.push({
      name: match[1],
      fields: section?.fields ?? {},
      startLine: lineNumberAt(text, startIndex),
      endLine: lineNumberAt(text, endIndex),
    });
  }

  return sections;
}

function parseBlocks(text: string) {
  const blocks: FileBlockRecord[] = [];
  for (const match of text.matchAll(/START_BLOCK_([A-Za-z0-9_]+)([\s\S]*?)END_BLOCK_\1/g)) {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    blocks.push({
      name: match[1],
      startLine: lineNumberAt(text, startIndex),
      endLine: lineNumberAt(text, endIndex),
    });
  }

  return blocks;
}

function extractLinkedModuleIds(moduleContract: FileFieldSection | null) {
  return splitList(moduleContract?.fields.LINKS).filter((item) => /^M-[A-Za-z0-9-]+$/.test(item));
}

function parseGovernedFile(root: string, filePath: string): FileMarkupRecord {
  const text = readFileSync(filePath, "utf8");
  const moduleContract = parseFieldSection(findSection(text, "START_MODULE_CONTRACT", "END_MODULE_CONTRACT"));
  return {
    path: normalizeRelative(root, filePath),
    moduleContract,
    moduleMap: parseListSection(findSection(text, "START_MODULE_MAP", "END_MODULE_MAP")),
    changeSummary: parseFieldSection(findSection(text, "START_CHANGE_SUMMARY", "END_CHANGE_SUMMARY")),
    contracts: parseScopedFieldSections(text),
    blocks: parseBlocks(text),
    linkedModuleIds: extractLinkedModuleIds(moduleContract),
  };
}

function loadGovernedFiles(root: string) {
  const { config, issues } = loadGraceLintConfig(root);
  const configErrors = issues.filter((issue) => issue.severity === "error");
  if (configErrors.length > 0) {
    throw new Error(configErrors.map((issue) => issue.message).join("\n"));
  }

  const files: FileMarkupRecord[] = [];
  for (const filePath of collectCodeFiles(root, config?.ignoredDirs ?? [])) {
    const text = readFileSync(filePath, "utf8");
    if (!hasGraceMarkers(text)) {
      continue;
    }

    files.push(parseGovernedFile(root, filePath));
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function ensureRequiredDocs(root: string) {
  const missingDocs = REQUIRED_DOCS.filter((relativePath) => !existsSync(path.join(root, relativePath)));
  if (missingDocs.length > 0) {
    throw new Error(`Missing required GRACE artifacts: ${missingDocs.join(", ")}`);
  }
}

function readDoc(root: string, relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

export function getModuleName(moduleRecord: ModuleRecord) {
  return moduleRecord.plan?.name ?? moduleRecord.graph?.name ?? moduleRecord.name ?? moduleRecord.id;
}

export function getModuleType(moduleRecord: ModuleRecord) {
  return moduleRecord.plan?.type ?? moduleRecord.graph?.type ?? moduleRecord.type;
}

export function getModulePath(moduleRecord: ModuleRecord) {
  return moduleRecord.graph?.path ?? moduleRecord.localFiles[0]?.path;
}

export function getModuleDepends(moduleRecord: ModuleRecord) {
  const depends = new Set<string>();
  for (const value of moduleRecord.plan?.depends ?? []) {
    depends.add(value);
  }
  for (const value of moduleRecord.graph?.depends ?? []) {
    depends.add(value);
  }

  return Array.from(depends).sort();
}

export function getModuleVerificationIds(moduleRecord: ModuleRecord) {
  return moduleRecord.verifications.map((entry) => entry.id).sort();
}

export function loadGraceArtifactIndex(projectRoot: string): GraceArtifactIndex {
  const root = path.resolve(projectRoot);
  ensureRequiredDocs(root);

  const planModules = parsePlanModules(readDoc(root, "docs/development-plan.xml"));
  const graphModules = parseGraphModules(readDoc(root, "docs/knowledge-graph.xml"));
  const verifications = parseVerificationEntries(readDoc(root, "docs/verification-plan.xml"));
  const governedFiles = loadGovernedFiles(root);
  const steps = parsePlanSteps(readDoc(root, "docs/development-plan.xml"));

  const moduleIds = new Set<string>([
    ...planModules.keys(),
    ...graphModules.keys(),
    ...verifications.flatMap((entry) => (entry.moduleId ? [entry.moduleId] : [])),
    ...governedFiles.flatMap((file) => file.linkedModuleIds),
  ]);

  const modules = Array.from(moduleIds)
    .sort()
    .map((id) => {
      const planRecord = planModules.get(id) ?? null;
      const graphRecord = graphModules.get(id) ?? null;
      return {
        id,
        name: planRecord?.name ?? graphRecord?.name,
        type: planRecord?.type ?? graphRecord?.type,
        plan: planRecord,
        graph: graphRecord,
        verifications: verifications.filter((entry) => entry.moduleId === id).sort((left, right) => left.id.localeCompare(right.id)),
        localFiles: governedFiles.filter((file) => file.linkedModuleIds.includes(id)).sort((left, right) => left.path.localeCompare(right.path)),
        steps: steps.filter((step) => step.moduleId === id),
      } satisfies ModuleRecord;
    });

  return {
    root,
    modules,
    verifications: verifications.sort((left, right) => left.id.localeCompare(right.id)),
    files: governedFiles,
  };
}

function applyTextMatch(
  matchedBy: Set<string>,
  label: string,
  query: string,
  candidate: string | undefined,
  exactScore: number,
  containsScore: number,
) {
  if (!candidate) {
    return 0;
  }

  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate === query) {
    matchedBy.add(label);
    return exactScore;
  }

  if (normalizedCandidate.includes(query)) {
    matchedBy.add(label);
    return containsScore;
  }

  return 0;
}

function pathMatchScore(moduleRecord: ModuleRecord, targetPath: string) {
  let bestScore = 0;
  const graphPath = moduleRecord.graph?.path;

  if (graphPath) {
    if (graphPath === targetPath) {
      bestScore = Math.max(bestScore, 100000 + graphPath.length);
    } else if (targetPath.startsWith(`${graphPath}/`)) {
      bestScore = Math.max(bestScore, 90000 + graphPath.length);
    } else if (graphPath.startsWith(`${targetPath}/`)) {
      bestScore = Math.max(bestScore, 70000 + graphPath.length);
    }
  }

  for (const file of moduleRecord.localFiles) {
    if (file.path === targetPath) {
      bestScore = Math.max(bestScore, 85000 + file.path.length);
    } else if (file.path.startsWith(`${targetPath}/`)) {
      bestScore = Math.max(bestScore, 65000 + file.path.length);
    }
  }

  return bestScore;
}

function matchesTypeFilter(moduleRecord: ModuleRecord, type?: string) {
  if (!type) {
    return true;
  }

  return (getModuleType(moduleRecord) ?? "").toLowerCase() === type.toLowerCase();
}

function matchesDependencyFilter(moduleRecord: ModuleRecord, dependsOn?: string) {
  if (!dependsOn) {
    return true;
  }

  const needle = dependsOn.toLowerCase();
  return getModuleDepends(moduleRecord).some((dependency) => dependency.toLowerCase() === needle);
}

export function findModules(index: GraceArtifactIndex, options: ModuleFindOptions = {}) {
  const query = options.query?.trim();
  const normalizedQuery = query?.toLowerCase();
  const normalizedPathQuery = query ? normalizeInputPath(index.root, query) : undefined;

  const matches: ModuleMatch[] = [];
  for (const moduleRecord of index.modules) {
    if (!matchesTypeFilter(moduleRecord, options.type) || !matchesDependencyFilter(moduleRecord, options.dependsOn)) {
      continue;
    }

    if (!normalizedQuery) {
      matches.push({
        module: moduleRecord,
        score: 1,
        matchedBy: ["filters"],
      });
      continue;
    }

    const matchedBy = new Set<string>();
    let score = 0;

    score = Math.max(score, applyTextMatch(matchedBy, "id", normalizedQuery, moduleRecord.id, 100, 70));
    score = Math.max(score, applyTextMatch(matchedBy, "name", normalizedQuery, getModuleName(moduleRecord), 90, 60));
    score = Math.max(score, applyTextMatch(matchedBy, "type", normalizedQuery, getModuleType(moduleRecord), 80, 45));
    score = Math.max(score, applyTextMatch(matchedBy, "plan-purpose", normalizedQuery, moduleRecord.plan?.contract.purpose, 55, 30));
    score = Math.max(score, applyTextMatch(matchedBy, "graph-purpose", normalizedQuery, moduleRecord.graph?.purpose, 55, 30));

    for (const dependency of getModuleDepends(moduleRecord)) {
      score = Math.max(score, applyTextMatch(matchedBy, "dependency", normalizedQuery, dependency, 60, 35));
    }

    for (const verificationId of getModuleVerificationIds(moduleRecord)) {
      score = Math.max(score, applyTextMatch(matchedBy, "verification", normalizedQuery, verificationId, 75, 40));
    }

    for (const item of moduleRecord.plan?.interfaceItems ?? []) {
      score = Math.max(score, applyTextMatch(matchedBy, "plan-interface", normalizedQuery, item.tag, 45, 25));
      score = Math.max(score, applyTextMatch(matchedBy, "plan-interface", normalizedQuery, item.purpose, 35, 20));
    }

    for (const item of moduleRecord.graph?.annotations ?? []) {
      score = Math.max(score, applyTextMatch(matchedBy, "graph-annotation", normalizedQuery, item.tag, 45, 25));
      score = Math.max(score, applyTextMatch(matchedBy, "graph-annotation", normalizedQuery, item.purpose, 35, 20));
    }

    for (const file of moduleRecord.localFiles) {
      score = Math.max(score, applyTextMatch(matchedBy, "file-path", normalizedQuery, file.path, 85, 50));
      score = Math.max(score, applyTextMatch(matchedBy, "file-purpose", normalizedQuery, file.moduleContract?.fields.PURPOSE, 40, 20));
      score = Math.max(score, applyTextMatch(matchedBy, "file-scope", normalizedQuery, file.moduleContract?.fields.SCOPE, 35, 20));
    }

    if (normalizedPathQuery) {
      const pathScore = pathMatchScore(moduleRecord, normalizedPathQuery);
      if (pathScore > 0) {
        matchedBy.add("path");
        score = Math.max(score, pathScore / 1000);
      }
    }

    if (score > 0) {
      matches.push({
        module: moduleRecord,
        score,
        matchedBy: Array.from(matchedBy).sort(),
      });
    }
  }

  return matches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.module.id.localeCompare(right.module.id);
  });
}

export function resolveModule(index: GraceArtifactIndex, target: string) {
  const normalizedTarget = target.trim();
  const exactId = index.modules.find((moduleRecord) => moduleRecord.id.toLowerCase() === normalizedTarget.toLowerCase());
  if (exactId) {
    return exactId;
  }

  const normalizedPath = normalizeInputPath(index.root, normalizedTarget);
  const candidates = index.modules
    .map((moduleRecord) => ({
      module: moduleRecord,
      score: pathMatchScore(moduleRecord, normalizedPath),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.module.id.localeCompare(right.module.id));

  if (candidates.length === 0) {
    throw new Error(`No module found for \`${target}\`. Use \`grace module find ${target}\` to inspect candidates.`);
  }

  const topScore = candidates[0].score;
  const tiedCandidates = candidates.filter((candidate) => candidate.score === topScore);
  if (tiedCandidates.length > 1) {
    throw new Error(`Path \`${target}\` is ambiguous. Matching modules: ${tiedCandidates.map((candidate) => candidate.module.id).join(", ")}.`);
  }

  return candidates[0].module;
}

export function resolveGovernedFile(index: GraceArtifactIndex, target: string) {
  const normalizedTarget = normalizeInputPath(index.root, target.trim());
  const fileRecord = index.files.find((record) => record.path === normalizedTarget);
  if (!fileRecord) {
    throw new Error(`No governed file found for \`${target}\`.`);
  }

  return fileRecord;
}
