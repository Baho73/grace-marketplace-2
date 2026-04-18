import { defineCommand } from "citty";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { getMaxEscalations, getTelegram, loadAfkConfig } from "./afk/config";
import { appendDecision, appendDeferred, readJournal } from "./afk/journal";
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
import {
  classifyAnswer,
  fetchUpdates,
  matchReply,
  sendMessage,
  type TelegramTransport,
} from "./afk/telegram";

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
          description: 'Options in "A:label|B:label|C:label" form',
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
          process.exit(1);
        }

        const session = readSession(projectRoot, sessionId);
        const maxEscalations = getMaxEscalations(config);
        if (session && session.escalations >= maxEscalations) {
          process.stderr.write(
            `grace afk ask: max ${maxEscalations} escalations already sent this session. ` +
              "Agent MUST defer remaining one-way-door decisions.\n",
          );
          process.exit(1);
        }

        const correlationId = shortCorrelationId();
        const optionsList = String(context.args.options)
          .split("|")
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
          process.exit(1);
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
          process.exit(1);
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
        class: { type: "string", required: true, description: "Decision class (e.g. reversible-act)" },
        title: { type: "string", required: true, description: "Short title" },
        contextLine: { type: "string", description: "Context / plan step reference", default: "-" },
        options: { type: "string", description: "Pipe-separated options considered", default: "" },
        chosen: { type: "string", description: "Chosen option", default: "" },
        rationale: { type: "string", required: true, description: "1-2 sentence rationale" },
        outcome: { type: "string", required: true, description: "Commit hash, deferred ref, etc." },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId } = enforceActive(projectRoot);
        const paths = resolveSessionPaths(projectRoot, sessionId);

        appendDecision(paths.decisionsPath, {
          timestamp: new Date().toISOString(),
          klass: String(context.args.class) as ReturnType<typeof String>,
          title: String(context.args.title),
          context: String(context.args.contextLine),
          optionsConsidered: String(context.args.options)
            .split("|")
            .map((entry) => entry.trim())
            .filter(Boolean),
          chosen: String(context.args.chosen) || undefined,
          rationale: String(context.args.rationale),
          outcome: String(context.args.outcome),
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
        contextLine: { type: "string", required: true, description: "Context reference (step / file / decision)" },
        suggestion: { type: "string", description: "Optional recommended default", default: "" },
      },
      async run(context) {
        const projectRoot = toPath(context.args.path);
        const { sessionId } = enforceActive(projectRoot);
        const paths = resolveSessionPaths(projectRoot, sessionId);

        appendDeferred(paths.deferredPath, {
          timestamp: new Date().toISOString(),
          question: String(context.args.question),
          context: String(context.args.contextLine),
          suggestion: String(context.args.suggestion) || undefined,
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
        const session = check.session ?? (check.ok ? check.session : null);
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
          process.exit(1);
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
  const optionsBlock = input.options.length === 0
    ? "  (no options enumerated)"
    : input.options.map((option) => `  ${option}`).join("\n");
  const pick = input.myPick ? `\nMy pick: ${input.myPick} (${input.confidence}% confidence)` : "";
  return [
    `*/afk decision ${input.correlationId}* (session ${input.sessionId})`,
    "",
    `*${input.title}*`,
    `Situation: ${input.context}`,
    "Options:",
    optionsBlock,
    pick,
    "",
    `Reply with one of: A / B / C / D / E / PROCEED / STOP / EVOLVE / DEFER`,
    `Or prefix with \`${input.correlationId}\` so I can match your answer.`,
  ].join("\n");
}
