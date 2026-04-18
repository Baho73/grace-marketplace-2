/**
 * Append-only journal for /afk sessions.
 *
 * decisions.md — every decision the agent made (class, context, rationale, outcome).
 * deferred.md — questions requiring human attention on return.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export type DecisionClass =
  | "reversible-act"
  | "uncertain-deferred"
  | "one-way-door-escalated"
  | "one-way-door-deferred"
  | "scope-creep-deferred"
  | "threshold-yellow-rollback"
  | "threshold-red-escalated"
  | "checkpoint";

export type DecisionEntry = {
  timestamp: string;
  klass: DecisionClass;
  title: string;
  context: string;
  optionsConsidered?: string[];
  chosen?: string;
  rationale: string;
  outcome: string;
};

function ensureHeader(filePath: string, header: string) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, header);
  }
}

export function appendDecision(filePath: string, entry: DecisionEntry) {
  ensureHeader(filePath, "# /afk decisions journal\n\n");
  const lines: string[] = [];
  lines.push(`## ${entry.timestamp} — ${entry.title}`);
  lines.push(`- class: \`${entry.klass}\``);
  lines.push(`- context: ${entry.context}`);
  if (entry.optionsConsidered && entry.optionsConsidered.length > 0) {
    lines.push(`- options: ${entry.optionsConsidered.map((option) => `\`${option}\``).join(" | ")}`);
  }
  if (entry.chosen) {
    lines.push(`- chosen: \`${entry.chosen}\``);
  }
  lines.push(`- rationale: ${entry.rationale}`);
  lines.push(`- outcome: ${entry.outcome}`);
  lines.push("");
  appendFileSync(filePath, lines.join("\n") + "\n");
}

export type DeferredEntry = {
  timestamp: string;
  question: string;
  context: string;
  suggestion?: string;
};

export function appendDeferred(filePath: string, entry: DeferredEntry) {
  ensureHeader(filePath, "# /afk deferred for human review\n\nOne line per question. Review on return.\n\n");
  const suggestion = entry.suggestion ? ` (suggestion: ${entry.suggestion})` : "";
  const line = `- [${entry.timestamp}] ${entry.question} — context: ${entry.context}${suggestion}\n`;
  appendFileSync(filePath, line);
}

export function readJournal(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}
