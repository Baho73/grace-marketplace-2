import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { getModulePath, loadGraceArtifactIndex } from "./query/core";

export const REQUIRED_DOCS = [
  "docs/knowledge-graph.xml",
  "docs/development-plan.xml",
  "docs/verification-plan.xml",
] as const;

export const OPTIONAL_DOCS = [
  "docs/requirements.xml",
  "docs/technology.xml",
  "docs/operational-packets.xml",
] as const;

export const ACTIVATION_FILES = ["AGENTS.md", "CLAUDE.md", ".claude/settings.json"] as const;

export type BriefStatus = {
  initialized: boolean;
  missingRequired: string[];
  missingOptional: string[];
  missingActivation: string[];
  moduleCount: number;
  verificationCount: number;
  coveredModules: number;
  governedFiles: number;
  pendingSteps: number;
  completedSteps: number;
  oldestArtifactAgeDays: number | null;
  nextAction: string;
};

function fileAgeDays(filePath: string) {
  try {
    const stat = statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return Math.max(0, Math.round(ageMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

export function runStatusForTest(projectRoot: string): BriefStatus {
  return collectBrief(projectRoot);
}

export function collectBrief(projectRoot: string): BriefStatus {
  const root = path.resolve(projectRoot);

  const missingRequired = REQUIRED_DOCS.filter((relative) => !existsSync(path.join(root, relative)));
  const missingOptional = OPTIONAL_DOCS.filter((relative) => !existsSync(path.join(root, relative)));
  const missingActivation = ACTIVATION_FILES.filter((relative) => !existsSync(path.join(root, relative)));

  if (missingRequired.length > 0) {
    return {
      initialized: false,
      missingRequired: [...missingRequired],
      missingOptional: [...missingOptional],
      missingActivation: [...missingActivation],
      moduleCount: 0,
      verificationCount: 0,
      coveredModules: 0,
      governedFiles: 0,
      pendingSteps: 0,
      completedSteps: 0,
      oldestArtifactAgeDays: null,
      nextAction: "Run $grace-init to bootstrap the GRACE structure.",
    };
  }

  const index = loadGraceArtifactIndex(root);
  const moduleCount = index.modules.length;
  const verificationCount = index.verifications.length;
  const coveredModules = index.modules.filter((moduleRecord) => moduleRecord.verifications.length > 0).length;
  const governedFiles = index.files.length;

  const allSteps = index.modules.flatMap((moduleRecord) => moduleRecord.steps);
  const pendingSteps = allSteps.filter((step) => (step.stepStatus ?? "").toLowerCase() === "pending").length;
  const completedSteps = allSteps.filter((step) => {
    const value = (step.stepStatus ?? "").toLowerCase();
    return value === "completed" || value === "complete" || value === "done";
  }).length;

  const ages = REQUIRED_DOCS.map((relative) => fileAgeDays(path.join(root, relative))).filter(
    (value): value is number => typeof value === "number",
  );
  const oldestArtifactAgeDays = ages.length > 0 ? Math.max(...ages) : null;

  const nextAction = chooseNextAction({
    missingOptional,
    missingActivation,
    pendingSteps,
    coveredModules,
    moduleCount,
    governedFiles,
  });

  return {
    initialized: true,
    missingRequired: [...missingRequired],
    missingOptional: [...missingOptional],
    missingActivation: [...missingActivation],
    moduleCount,
    verificationCount,
    coveredModules,
    governedFiles,
    pendingSteps,
    completedSteps,
    oldestArtifactAgeDays,
    nextAction,
  };
}

function chooseNextAction(parts: {
  missingOptional: readonly string[];
  missingActivation: readonly string[];
  pendingSteps: number;
  coveredModules: number;
  moduleCount: number;
  governedFiles: number;
}) {
  if (parts.missingActivation.includes("CLAUDE.md")) {
    return "CLAUDE.md missing — re-run $grace-init to emit the activation preamble.";
  }
  if (parts.missingActivation.includes(".claude/settings.json")) {
    return "SessionStart hook missing — add .claude/settings.json from $grace-init template.";
  }
  if (parts.moduleCount === 0) {
    return "No modules registered — run $grace-plan to define architecture.";
  }
  if (parts.coveredModules < parts.moduleCount) {
    return `Verification coverage incomplete (${parts.coveredModules}/${parts.moduleCount}) — run $grace-verification.`;
  }
  if (parts.pendingSteps > 0) {
    return `${parts.pendingSteps} pending step(s) — run $grace-execute or $grace-multiagent-execute.`;
  }
  if (parts.governedFiles === 0) {
    return "No governed files yet — implementation waves have not started.";
  }
  return "All gates green — continue normal work or run $grace-reviewer full-integrity at phase boundaries.";
}

export function renderBrief(root: string, status: BriefStatus) {
  const lines: string[] = [];
  lines.push(`GRACE status — ${path.basename(path.resolve(root))}`);

  if (!status.initialized) {
    lines.push(`Initialized: NO`);
    lines.push(`Missing required: ${status.missingRequired.join(", ")}`);
    lines.push(`Next action: ${status.nextAction}`);
    return lines.join("\n");
  }

  const coveragePercent = status.moduleCount === 0 ? 0 : Math.round((status.coveredModules / status.moduleCount) * 100);
  lines.push(`Initialized: YES`);
  lines.push(`Modules: ${status.moduleCount}   Governed files: ${status.governedFiles}`);
  lines.push(`Verification coverage: ${status.coveredModules}/${status.moduleCount} modules (${coveragePercent}%)   entries: ${status.verificationCount}`);
  lines.push(`Plan steps: ${status.completedSteps} completed, ${status.pendingSteps} pending`);

  const activationFlags = ACTIVATION_FILES.map((file) => `${file}:${status.missingActivation.includes(file) ? "MISSING" : "ok"}`).join("  ");
  lines.push(`Activation: ${activationFlags}`);

  if (status.missingOptional.length > 0) {
    lines.push(`Optional docs missing: ${status.missingOptional.join(", ")}`);
  }

  if (typeof status.oldestArtifactAgeDays === "number") {
    lines.push(`Oldest core artifact: ${status.oldestArtifactAgeDays} day(s) since last edit`);
  }

  lines.push(`Next action: ${status.nextAction}`);
  return lines.join("\n");
}

export function renderFull(root: string, status: BriefStatus) {
  const lines: string[] = [];
  lines.push(renderBrief(root, status));

  if (!status.initialized) {
    return lines.join("\n");
  }

  const index = loadGraceArtifactIndex(path.resolve(root));
  lines.push("");
  lines.push("Modules:");
  for (const moduleRecord of index.modules) {
    const type = moduleRecord.plan?.type ?? moduleRecord.graph?.type ?? "?";
    const modulePath = getModulePath(moduleRecord) ?? "-";
    const verifyCount = moduleRecord.verifications.length;
    lines.push(`  ${moduleRecord.id.padEnd(14)} ${type.padEnd(14)} ${modulePath}  [V:${verifyCount}]`);
  }

  return lines.join("\n");
}
