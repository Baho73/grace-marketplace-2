// FILE: src/grace-afk.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: citty subcommand `grace afk` — autonomous-harness start / tick / ask / check / journal / defer / increment / report / stop.
//   SCOPE: CLI wiring + I/O only. Business logic lives in src/afk/*; this module orchestrates them and enforces the active-session gate.
//   DEPENDS: citty, node:crypto, node:path, ./afk/config, ./afk/journal, ./afk/session, ./afk/telegram
//   LINKS: docs/knowledge-graph.xml#M-CLI-AFK, docs/verification-plan.xml#V-M-CLI-AFK, skills/grace/grace-afk/SKILL.md
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   afkCommand       - Root citty command with 9 subcommands
//   buildAskMessage  - Format the <=10-line Telegram payload (plain text, no markdown)
// END_MODULE_MAP

import { defineCommand } from "citty";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { getMaxEscalations, getTelegram, loadAfkConfig } from "./afk/config";
import { DECISION_CLASSES, appendDecision, appendDeferred, isDecisionClass, readJournal } from "./afk/journal";
import {
  EXIT_BUDGET_EXHAUSTED,
  EXIT_NO_SESSION,
  EXIT_SESSION_STOPPED,
  checkActive,
  createSession,
  formatRemaining,
  incrementCounter,
  markCompleted,
  markStopped,
  readSession,
  resolveSessionPaths,
  updateLastTick,
} from "./afk/session";
import { classifyAnswer, fetchUpdates, matchReply, sendMessage } from "./afk/telegram";

const EXIT_BAD_ARGS = 2;
const EXIT_TELEGRAM_FAILURE = 45;
const EXIT_CONFIG_MISSING = 46;

function toPath(value: unknown, fallback = ".") {
  return path.resolve(String(value ?? fallback));
}

function shortCorrelationId() {
  return randomBytes(3).toString("hex");
}

/**
 * Enforce the active-session guard. Any `grace afk` subcommand (except `start`)
 * must call this first. The CLI — NOT the agent — decides when to stop.
 */
function enforceActive(projectRoot: string, allowStopped = false): { sessionId: string; remainingMs: number } {
  const check = checkActive(projectRoot);
  if (check.ok) {
    return { sessionId: check.session.id, remainingMs: check.remainingMs };
  }

  if (check.reason === "no-active-session") {
    process.stderr.write("grace-afk: no active session. Run `grace afk start <hours>` first.\n");
    process.exit(EXIT_NO_SESSION);
  }
  if (check.reason === "expired") {
    process.stderr.write(
      `grace-afk: session ${check.session?.id ?? "?"} expired at ${check.session?.expiresAt ?? "?"}. ` +
        "Budget exhausted — agent must commit final state and stop.\n",
    );
    process.exit(EXIT_BUDGET_EXHAUSTED);
  }
  if (check.reason === "stopped") {
    if (allowStopped) {
      return { sessionId: check.session!.id, remainingMs: 0 };
    }
    process.stderr.write(
      `grace-afk: session ${check.session?.id ?? "?"} was stopped (reason: ${
        check.session?.stopReason ?? "unknown"
      }).\n`,
    );
    process.exit(EXIT_SESSION_STOPPED);
  }

  process.exit(EXIT_NO_SESSION);
}

export const afkCommand = defineCommand({
  meta: {
    name: "afk",
    description:
      "Autonomous harness. CLI enforces session time budget; agent polls `grace afk tick` between steps.",
  },
  subCommands: {
    start: defineCommand({
      meta: {
        name: "start",
        description: "Start a new /afk session. Creates docs/afk-sessions/<id>/ and a state.json with expiresAt.",
      },
      args: {
        hours: { type: "positional", description: "Hours of autonomy (0 < h <= 24)", default: "2" },
        budgetPercent: { type: "positional", required: false, description: "Optional weekly-token budget cap (%)" },
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        checkpoint: { type: "string", description: "Checkpoint interval in minutes (5-180)", default: "30" },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const hours = Number(context.args.hours ?? 2);
        const budgetRaw = context.args.budgetPercent;
        const budgetPercent = budgetRaw === undefined || budgetRaw === "" ? null : Number(budgetRaw);
        const checkpointMinutes = Number(context.args.checkpoint ?? 30);

        const state = createSession(
          projectRoot,
          { hours, budgetPercent, checkpointMinutes },
          new Date(),
        );

        const lines = [
          `Started /afk session ${state.id}`,
          `  hours:       ${state.hours}`,
          `  budget%:     ${state.budgetPercent === null ? "default" : state.budgetPercent + "%"}`,
          `  checkpoint:  ${state.checkpointMinutes}m`,
          `  expires:     ${state.expiresAt}`,
          `  journal:     docs/afk-sessions/${state.id}/`,
          "",
          "Agent protocol:",
          "  - Between steps, run `grace afk tick --path .` — non-zero exit means session over.",
          "  - For uncertain one-way-door decisions: `grace afk ask --title ... --options ...`.",
          "  - For decisions deferred to human: `grace afk defer --question ... --context ...`.",
          "  - Record every decision: `grace afk journal --class ... --title ... --rationale ... --outcome ...`.",
          "  - On exit/expire: `grace afk report` emits the dashboard.",
        ];
        process.stdout.write(lines.join("\n") + "\n");
      },
    }),

    tick: defineCommand({
      meta: {
        name: "tick",
        description:
          "CLI-side budget enforcement. Exits non-zero if the session is expired, stopped, or missing. Agent must call between steps.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId, remainingMs } = enforceActive(projectRoot);
        updateLastTick(projectRoot, sessionId);
        process.stdout.write(
          `session=${sessionId} remaining=${formatRemaining(remainingMs)} status=active\n`,
        );
      },
    }),

    ask: defineCommand({
      meta: {
        name: "ask",
        description:
          "Send a Telegram escalation for a one-way-door decision. Prints the correlation id the agent must use to poll for a reply.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        title: { type: "string", required: true, description: "Short decision title" },
        context: { type: "string", required: true, description: "One-sentence situation description" },
        options: {
          type: "string",
          required: true,
          description: 'Options as "A:label|B:label" or "A:label;B:label" (semicolon is safer on Windows shells)',
        },
        mypick: { type: "string", description: "Letter you currently favor (A/B/...)", default: "" },
        confidence: { type: "string", description: "Confidence percent (0-100)", default: "50" },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId } = enforceActive(projectRoot);

        const { config, error } = loadAfkConfig(projectRoot);
        const telegram = getTelegram(config);
        if (!telegram) {
          process.stderr.write(
            `grace afk ask: Telegram not configured (${error ?? "missing telegram.botToken/chatId"}). ` +
              "Agent MUST fall back to `grace afk defer` for one-way-door decisions.\n",
          );
          process.exitCode = EXIT_CONFIG_MISSING;
          return;
        }

        const session = readSession(projectRoot, sessionId);
        const maxEscalations = getMaxEscalations(config);
        if (session && session.escalations >= maxEscalations) {
          process.stderr.write(
            `grace afk ask: max ${maxEscalations} escalations already sent this session. ` +
              "Agent MUST defer remaining one-way-door decisions.\n",
          );
          process.exitCode = EXIT_BAD_ARGS;
          return;
        }

        const correlationId = shortCorrelationId();
        // Accept both "|" and ";" as separators: cmd.exe on Windows interprets unquoted "|" as
        // a pipe even when the whole argument is quoted, because bun.cmd is a shim that re-parses.
        const optionsList = String(context.args.options)
          .split(/[|;]/)
          .map((entry) => entry.trim())
          .filter(Boolean);

        const text = buildAskMessage({
          correlationId,
          sessionId,
          title: String(context.args.title),
          context: String(context.args.context),
          options: optionsList,
          myPick: String(context.args.mypick),
          confidence: String(context.args.confidence),
        });

        const result = await sendMessage(telegram, text);
        if (!result.ok) {
          process.stderr.write(
            `grace afk ask: Telegram sendMessage failed (${result.errorDescription ?? "unknown"}).\n`,
          );
          process.exitCode = EXIT_TELEGRAM_FAILURE;
          return;
        }

        incrementCounter(projectRoot, sessionId, "escalations");
        process.stdout.write(
          JSON.stringify({ correlationId, messageId: result.messageId, sessionId }, null, 2) + "\n",
        );
      },
    }),

    check: defineCommand({
      meta: {
        name: "check",
        description: "Poll Telegram for a reply matching a correlation id. Prints the recognized verb or `pending`.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        correlation: { type: "string", required: true, description: "Correlation id returned by `ask`" },
        messageid: {
          type: "string",
          description: "Telegram message id returned by `ask` (for reply_to matching)",
          default: "0",
        },
        offset: {
          type: "string",
          description: "getUpdates offset (default 0 = all)",
          default: "0",
        },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        enforceActive(projectRoot);

        const { config, error } = loadAfkConfig(projectRoot);
        const telegram = getTelegram(config);
        if (!telegram) {
          process.stderr.write(`grace afk check: Telegram not configured (${error ?? "missing config"}).\n`);
          process.exitCode = EXIT_CONFIG_MISSING;
          return;
        }

        const offset = Number(context.args.offset);
        const messageId = Number(context.args.messageid);
        const correlationId = String(context.args.correlation);
        const replies = await fetchUpdates(telegram, Number.isFinite(offset) && offset > 0 ? offset : null);

        for (const reply of replies) {
          if (!matchReply(reply, messageId, correlationId)) {
            continue;
          }
          const classified = classifyAnswer(reply.text);
          process.stdout.write(
            JSON.stringify(
              {
                status: classified.recognized ? "answered" : "unrecognized",
                verb: classified.verb,
                raw: classified.raw,
                nextOffset: reply.updateId + 1,
              },
              null,
              2,
            ) + "\n",
          );
          return;
        }

        process.stdout.write(JSON.stringify({ status: "pending" }) + "\n");
      },
    }),

    journal: defineCommand({
      meta: {
        name: "journal",
        description: "Append a decision entry to the active session's decisions.md.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        class: {
          type: "string",
          required: true,
          description: `Decision class. One of: ${DECISION_CLASSES.join(", ")}`,
        },
        title: { type: "string", required: true, description: "Short title" },
        // `--context` is the canonical name. `--contextLine` accepted as an alias for back-compat.
        context: { type: "string", description: "Context / plan step reference", default: "-" },
        contextLine: { type: "string", description: "Alias for --context", default: "" },
        options: { type: "string", description: "Pipe-separated options considered", default: "" },
        chosen: { type: "string", description: "Chosen option", default: "" },
        rationale: { type: "string", required: true, description: "1-2 sentence rationale" },
        outcome: { type: "string", required: true, description: "Commit hash, deferred ref, etc." },
      },
      async run(ctx) {
        const projectRoot = toPath(ctx.args.path);
        const { sessionId } = enforceActive(projectRoot);
        const paths = resolveSessionPaths(projectRoot, sessionId);

        const klassArg = String(ctx.args.class);
        if (!isDecisionClass(klassArg)) {
          process.stderr.write(
            `grace afk journal: invalid --class "${klassArg}". Allowed: ${DECISION_CLASSES.join(", ")}\n`,
          );
          process.exit(EXIT_BAD_ARGS);
        }

        const contextValue = String(ctx.args.context || ctx.args.contextLine || "-");

        appendDecision(paths.decisionsPath, {
          timestamp: new Date().toISOString(),
          klass: klassArg,
          title: String(ctx.args.title),
          context: contextValue,
          optionsConsidered: String(ctx.args.options)
            .split("|")
            .map((entry) => entry.trim())
            .filter(Boolean),
          chosen: String(ctx.args.chosen) || undefined,
          rationale: String(ctx.args.rationale),
          outcome: String(ctx.args.outcome),
        });

        process.stdout.write(`appended to ${paths.decisionsPath}\n`);
      },
    }),

    defer: defineCommand({
      meta: {
        name: "defer",
        description: "Record a question that requires human attention on return.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        question: { type: "string", required: true, description: "The question for the human" },
        // `--context` is the canonical name. `--contextLine` accepted as an alias for back-compat.
        context: { type: "string", description: "Context reference (step / file / decision)", default: "" },
        contextLine: { type: "string", description: "Alias for --context", default: "" },
        suggestion: { type: "string", description: "Optional recommended default", default: "" },
      },
      async run(ctx) {
        const projectRoot = toPath(ctx.args.path);
        const { sessionId } = enforceActive(projectRoot);
        const paths = resolveSessionPaths(projectRoot, sessionId);

        const contextValue = String(ctx.args.context || ctx.args.contextLine || "");
        if (!contextValue) {
          process.stderr.write("grace afk defer: --context is required (alias: --contextLine)\n");
          process.exit(EXIT_BAD_ARGS);
        }

        appendDeferred(paths.deferredPath, {
          timestamp: new Date().toISOString(),
          question: String(ctx.args.question),
          context: contextValue,
          suggestion: String(ctx.args.suggestion) || undefined,
        });
        incrementCounter(projectRoot, sessionId, "deferred");

        process.stdout.write(`appended to ${paths.deferredPath}\n`);
      },
    }),

    report: defineCommand({
      meta: {
        name: "report",
        description: "Emit the return dashboard. Marks the session completed unless --keep-active is passed.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        keepActive: { type: "boolean", description: "Do not mark session completed", default: false },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const check = checkActive(projectRoot);
        const session = check.session;
        if (!session) {
          process.stderr.write("grace afk report: no session found.\n");
          process.exit(EXIT_NO_SESSION);
        }

        const paths = resolveSessionPaths(projectRoot, session.id);
        const deferred = readJournal(paths.deferredPath);
        const deferredCount = deferred.split("\n").filter((line) => line.trim().startsWith("- [")).length;

        const lines = [
          `/afk session ${session.id} — report`,
          `Status:       ${session.status}`,
          `Budget:       hours=${session.hours}  budget%=${session.budgetPercent ?? "default"}`,
          `Started:      ${session.createdAt}`,
          `Expires:      ${session.expiresAt}`,
          `Last tick:    ${session.lastTickAt ?? "never"}`,
          `Commits:      ${session.commits}`,
          `Escalations:  ${session.escalations}`,
          `Deferred:     ${deferredCount} (see ${path.relative(projectRoot, paths.deferredPath)})`,
          `Stop reason:  ${session.stopReason ?? "-"}`,
          `Journal:      ${path.relative(projectRoot, paths.decisionsPath)}`,
        ];
        process.stdout.write(lines.join("\n") + "\n");

        if (!Boolean(context.args.keepActive) && session.status === "active") {
          markCompleted(projectRoot, session.id);
        }
      },
    }),

    stop: defineCommand({
      meta: {
        name: "stop",
        description: "Mark the active session stopped. Agent MUST exit its loop after this call.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        reason: { type: "string", description: "Reason", default: "user-requested" },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId } = enforceActive(projectRoot, true);
        markStopped(projectRoot, sessionId, String(context.args.reason));
        process.stdout.write(`session ${sessionId} stopped (${context.args.reason})\n`);
      },
    }),

    increment: defineCommand({
      meta: {
        name: "increment",
        description: "Increment a session counter (commits|escalations|deferred). Used by the agent after each action.",
      },
      args: {
        path: { type: "string", alias: "p", description: "Project root", default: "." },
        field: { type: "positional", required: true, description: "commits | escalations | deferred" },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId } = enforceActive(projectRoot);
        const field = String(context.args.field);
        if (field !== "commits" && field !== "escalations" && field !== "deferred") {
          process.stderr.write(`grace afk increment: field must be commits|escalations|deferred, got ${field}\n`);
          process.exit(EXIT_BAD_ARGS);
        }
        incrementCounter(projectRoot, sessionId, field);
        process.stdout.write(`incremented ${field}\n`);
      },
    }),
  },
});

export function buildAskMessage(input: {
  correlationId: string;
  sessionId: string;
  title: string;
  context: string;
  options: string[];
  myPick: string;
  confidence: string;
}): string {
  // Plain text, no markdown. We intentionally strip any control characters from user-controlled
  // fields (title/context/options) because the transport sends plain text and we do not want
  // null bytes or CR/LF from malformed plan entries to garble the message.
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();

  const optionsBlock =
    input.options.length === 0
      ? "  (no options enumerated)"
      : input.options.map((option) => `  ${clean(option)}`).join("\n");
  const pick = input.myPick ? `\nMy pick: ${clean(input.myPick)} (${clean(input.confidence)}% confidence)` : "";
  return [
    `/afk decision ${input.correlationId} (session ${input.sessionId})`,
    "",
    clean(input.title),
    `Situation: ${clean(input.context)}`,
    "Options:",
    optionsBlock,
    pick,
    "",
    `Reply with one of: A / B / C / D / E / PROCEED / STOP / EVOLVE / DEFER`,
    `Or prefix with "${input.correlationId}" so I can match your answer.`,
  ].join("\n");
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-afk] Initial module. Post-review fixes:
//                - plain-text buildAskMessage (control-char stripping, no markdown)
//                - EXIT_TELEGRAM_FAILURE / EXIT_CONFIG_MISSING / EXIT_BAD_ARGS replace exit(1)
//                - --class validated against DECISION_CLASSES (no more silent garbage)
//                - --context canonical, --contextLine alias kept for back-compat
//                - dead tautology in report cmd removed
// END_CHANGE_SUMMARY
