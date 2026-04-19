// FILE: src/evolve/archive.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Serialize an EvolveArchive to docs/experiments/<topic>/results.xml with GRACE unique-tag conventions.
//   SCOPE: XML writing only. Directory creation is performed atomically. No command execution.
//   DEPENDS: node:fs, node:path, ./types
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-ARCHIVE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   archivePath     - Compute docs/experiments/<topic>/results.xml path
//   renderArchive   - Serialize EvolveArchive to XML text
//   writeArchive    - Atomic write via .tmp + renameSync
// END_MODULE_MAP

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

import type { EvolveArchive, TrialResult } from "./types";

export function archivePath(projectRoot: string, topic: string): string {
  const safeTopic = topic.replace(/[^a-z0-9-_]/gi, "_");
  return path.join(projectRoot, "docs", "experiments", safeTopic, "results.xml");
}

// START_CONTRACT: writeArchive
//   PURPOSE: Write the archive to disk atomically (create dir + .tmp + rename).
//   INPUTS: { projectRoot: string, archive: EvolveArchive }
//   OUTPUTS: string (absolute path of the written file)
//   SIDE_EFFECTS: Creates docs/experiments/<topic>/ and writes results.xml.
// END_CONTRACT: writeArchive
export function writeArchive(projectRoot: string, archive: EvolveArchive): string {
  const target = archivePath(projectRoot, archive.topic);
  const dir = path.dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${target}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, renderArchive(archive));
  renameSync(tmp, target);
  return target;
}

// START_CONTRACT: renderArchive
//   PURPOSE: Produce GRACE-compliant XML for an EvolveArchive.
//   INPUTS: { archive: EvolveArchive }
//   OUTPUTS: string (XML)
//   SIDE_EFFECTS: none
// END_CONTRACT: renderArchive
export function renderArchive(archive: EvolveArchive): string {
  const lines: string[] = [];
  lines.push(`<EvolveArchive VERSION="1">`);
  lines.push(`  <Topic>${xmlEscape(archive.topic)}</Topic>`);
  lines.push(`  <Goal>${xmlEscape(archive.spec.goal)}</Goal>`);
  lines.push(`  <StartedAt>${archive.startedAt}</StartedAt>`);
  if (archive.finishedAt) {
    lines.push(`  <FinishedAt>${archive.finishedAt}</FinishedAt>`);
  }
  if (archive.stoppedBy) {
    lines.push(`  <StoppedBy>${archive.stoppedBy}</StoppedBy>`);
  }
  if (archive.winnerCandidateId) {
    lines.push(`  <Winner>${xmlEscape(archive.winnerCandidateId)}</Winner>`);
  }

  lines.push(`  <Metrics>`);
  for (const metric of archive.spec.metrics) {
    lines.push(
      `    <M-${xmlSafeId(metric.id)} DIRECTION="${metric.direction}"${metric.weight ? ` WEIGHT="${metric.weight}"` : ""}${
        metric.veto !== undefined ? ` VETO="${metric.veto}"` : ""
      }>${xmlEscape(metric.description ?? "")}</M-${xmlSafeId(metric.id)}>`,
    );
  }
  lines.push(`  </Metrics>`);

  lines.push(`  <Trials>`);
  for (const trial of archive.trials) {
    lines.push(renderTrial(trial));
  }
  lines.push(`  </Trials>`);

  lines.push(`</EvolveArchive>`);
  return lines.join("\n") + "\n";
}

function renderTrial(trial: TrialResult): string {
  const candidateId = xmlSafeId(trial.candidateId);
  const lines: string[] = [];
  lines.push(
    `    <T-${candidateId} VERDICT="${trial.verdict}"${
      trial.score !== null ? ` SCORE="${trial.score.toFixed(4)}"` : ""
    }>`,
  );
  lines.push(`      <StartedAt>${trial.startedAt}</StartedAt>`);
  lines.push(`      <FinishedAt>${trial.finishedAt}</FinishedAt>`);
  lines.push(`      <Worktree>${xmlEscape(trial.worktreePath)}</Worktree>`);
  if (trial.reason) {
    lines.push(`      <Reason>${xmlEscape(trial.reason)}</Reason>`);
  }
  lines.push(`      <Metrics>`);
  for (const metric of trial.metrics) {
    const tag = xmlSafeId(metric.metricId);
    const value = metric.value === null ? "" : ` VALUE="${metric.value}"`;
    const exit = ` EXIT="${metric.exitCode}"`;
    const duration = ` DURATION_MS="${metric.durationMs}"`;
    lines.push(`        <m-${tag}${value}${exit}${duration}>`);
    if (metric.parseError) {
      lines.push(`          <ParseError>${xmlEscape(metric.parseError)}</ParseError>`);
    }
    lines.push(`        </m-${tag}>`);
  }
  lines.push(`      </Metrics>`);
  lines.push(`    </T-${candidateId}>`);
  return lines.join("\n");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xmlSafeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Atomic write (.tmp + rename) mirrors the afk session pattern.
// END_CHANGE_SUMMARY
