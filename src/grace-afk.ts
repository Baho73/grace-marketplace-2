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
//   afkCommand           - Root citty command with 9 subcommands
//   buildAskMessage      - Format the Telegram ask payload (plain text, no markdown)
//   buildAskKeyboard     - Construct inline keyboard: letter row + meta row + optional [Подробнее]
//   buildDetailsMessage  - Render SWOT breakdown (Преимущества/Недостатки/Возможности/Риски) per option
//   parseDetailsArg      - Parse the --details CLI string into a Map of OptionDetail
//   projectNameFromPath  - Convert kebab/snake basename to Title Case
//   OptionDetail         - Shape: { id, pros, cons, opportunities, risks }
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
import {
  answerCallbackQuery,
  classifyAnswer,
  editMessageRemoveKeyboard,
  fetchUpdates,
  matchReply,
  sendMessage,
  type InlineKeyboard,
} from "./afk/telegram";

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
        wait: {
          type: "string",
          description:
            "Block for up to N seconds waiting for a reply; ack inline-button taps immediately (default: 0 = return right after send).",
          default: "0",
        },
        details: {
          type: "string",
          description:
            'SWOT breakdown per option: "A|pros|cons|opportunities|risks;B|...". When present, the keyboard gains a [Подробнее] button that sends a follow-up breakdown message without cancelling the ask.',
          default: "",
        },
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
          projectName: projectNameFromPath(projectRoot),
          title: String(context.args.title),
          context: String(context.args.context),
          options: optionsList,
          myPick: String(context.args.mypick),
          confidence: String(context.args.confidence),
        });

        const detailsMap = parseDetailsArg(String(context.args.details ?? ""));
        const hasDetails = detailsMap.size > 0;
        const keyboard = buildAskKeyboard(correlationId, optionsList, hasDetails);
        const result = await sendMessage(telegram, text, keyboard);
        if (!result.ok) {
          process.stderr.write(
            `grace afk ask: Telegram sendMessage failed (${result.errorDescription ?? "unknown"}).\n`,
          );
          process.exitCode = EXIT_TELEGRAM_FAILURE;
          return;
        }

        incrementCounter(projectRoot, sessionId, "escalations");

        const waitSeconds = Number(context.args.wait ?? "0");
        if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) {
          process.stdout.write(
            JSON.stringify({ correlationId, messageId: result.messageId, sessionId }, null, 2) + "\n",
          );
          return;
        }

        // Blocking poll: ack any inline-button press as soon as it arrives so the user's Telegram
        // spinner stops within ~2s. Also ack within the 15-second callback timeout window.
        // DETAILS button is non-terminal — we send the SWOT breakdown follow-up and keep polling
        // on the same ask; the user still has to pick A/B/C/PROCEED/DEFER/STOP.
        const deadline = Date.now() + Math.min(waitSeconds, 600) * 1000; // cap at 10 minutes
        let offset: number | null = null;
        while (Date.now() < deadline) {
          const replies = await fetchUpdates(telegram, offset);
          let detailsHandled = false;
          for (const reply of replies) {
            offset = reply.updateId + 1;
            if (!matchReply(reply, result.messageId ?? 0, correlationId)) {
              continue;
            }
            const classified = classifyAnswer(reply.text);

            // DETAILS: non-terminal. Send the SWOT breakdown, ack callback, keep polling.
            if (classified.recognized && classified.verb === "DETAILS") {
              if (reply.callbackQueryId) {
                try {
                  await answerCallbackQuery(telegram, reply.callbackQueryId, "Sending details…");
                } catch {
                  /* non-fatal */
                }
              }
              if (hasDetails) {
                const detailsText = buildDetailsMessage({
                  projectName: projectNameFromPath(projectRoot),
                  correlationId,
                  options: optionsList,
                  details: detailsMap,
                });
                try {
                  await sendMessage(telegram, detailsText, null);
                } catch (error) {
                  process.stderr.write(
                    `grace afk ask: details follow-up failed: ${error instanceof Error ? error.message : String(error)}\n`,
                  );
                }
              }
              detailsHandled = true;
              continue;
            }

            if (reply.callbackQueryId) {
              try {
                await answerCallbackQuery(
                  telegram,
                  reply.callbackQueryId,
                  classified.recognized ? `Received: ${classified.verb}` : undefined,
                );
              } catch {
                /* non-fatal */
              }
              if (result.messageId) {
                try {
                  await editMessageRemoveKeyboard(telegram, result.messageId);
                } catch {
                  /* non-fatal */
                }
              }
            }
            process.stdout.write(
              JSON.stringify(
                {
                  correlationId,
                  messageId: result.messageId,
                  sessionId,
                  status: classified.recognized ? "answered" : "unrecognized",
                  verb: classified.verb,
                  raw: classified.raw,
                  source: reply.callbackQueryId ? "button" : "text",
                  nextOffset: offset,
                },
                null,
                2,
              ) + "\n",
            );
            return;
          }
          // If only DETAILS taps came through this tick, loop faster on the next poll.
          await new Promise((resolve) => setTimeout(resolve, detailsHandled ? 1000 : 2000));
        }

        process.stdout.write(
          JSON.stringify(
            {
              correlationId,
              messageId: result.messageId,
              sessionId,
              status: "pending",
              waitedSeconds: waitSeconds,
            },
            null,
            2,
          ) + "\n",
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

          // If the user pressed an inline button, we MUST dismiss the loading spinner in their
          // Telegram client and (optionally) strip the keyboard so they cannot tap a second answer.
          // Both calls are best-effort — failures are logged to stderr but do not change the check result.
          if (reply.callbackQueryId) {
            try {
              const ack = await answerCallbackQuery(
                telegram,
                reply.callbackQueryId,
                classified.recognized ? `Received: ${classified.verb}` : undefined,
              );
              if (!ack.ok) {
                process.stderr.write(`grace afk check: answerCallbackQuery failed: ${ack.errorDescription ?? "unknown"}\n`);
              }
            } catch (error) {
              process.stderr.write(`grace afk check: answerCallbackQuery threw: ${error instanceof Error ? error.message : String(error)}\n`);
            }
            if (messageId > 0) {
              try {
                await editMessageRemoveKeyboard(telegram, messageId);
              } catch {
                /* non-fatal */
              }
            }
          }

          process.stdout.write(
            JSON.stringify(
              {
                status: classified.recognized ? "answered" : "unrecognized",
                verb: classified.verb,
                raw: classified.raw,
                source: reply.callbackQueryId ? "button" : "text",
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

// START_CONTRACT: projectNameFromPath
//   PURPOSE: Convert the project-root basename into a human-readable project name.
//     grace-marketplace-2 -> "Grace Marketplace 2"
//   INPUTS: { projectRoot: string }
//   OUTPUTS: string (Title Case, single spaces)
//   SIDE_EFFECTS: none
// END_CONTRACT: projectNameFromPath
export function projectNameFromPath(projectRoot: string): string {
  const base = path.basename(path.resolve(projectRoot));
  if (!base) {
    return "project";
  }
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildAskMessage(input: {
  correlationId: string;
  sessionId: string;
  projectName: string;
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
    `[${clean(input.projectName)}] /afk decision ${input.correlationId}`,
    `(session ${input.sessionId})`,
    "",
    clean(input.title),
    `Situation: ${clean(input.context)}`,
    "Options:",
    optionsBlock,
    pick,
    "",
    `Tap a button below, or reply with one of: A / B / C / D / E / PROCEED / STOP / DEFER.`,
    `If replying by text, prefix with "${input.correlationId}" so I can match your answer.`,
  ].join("\n");
}

export type OptionDetail = {
  id: string;
  pros: string;
  cons: string;
  opportunities: string;
  risks: string;
};

// START_CONTRACT: parseDetailsArg
//   PURPOSE: Parse the --details CLI string into a Map of OptionDetail keyed by option id.
//     Syntax: "A|pros|cons|opps|risks;B|...;C|..." — 5 pipe-separated fields per option,
//     entries split by ';' (safer than '|' on Windows cmd shells).
//   INPUTS: { raw: string }
//   OUTPUTS: Map<string, OptionDetail>
//   SIDE_EFFECTS: none
// END_CONTRACT: parseDetailsArg
export function parseDetailsArg(raw: string): Map<string, OptionDetail> {
  const result = new Map<string, OptionDetail>();
  if (!raw) {
    return result;
  }
  for (const chunk of raw.split(";")) {
    const parts = chunk.split("|").map((part) => part.trim());
    if (parts.length < 2 || !parts[0]) {
      continue;
    }
    const [id, pros = "", cons = "", opportunities = "", risks = ""] = parts;
    result.set(id.toUpperCase(), { id: id.toUpperCase(), pros, cons, opportunities, risks });
  }
  return result;
}

// START_CONTRACT: buildDetailsMessage
//   PURPOSE: Render a SWOT-style breakdown (Преимущества / Недостатки / Возможности / Риски)
//     as a plain-text Telegram message, sized for mobile reading.
//   INPUTS: { projectName, correlationId, options: string[], details: Map<id, OptionDetail> }
//   OUTPUTS: string — plain text message, <= ~20 lines for 3-option case
//   SIDE_EFFECTS: none
// END_CONTRACT: buildDetailsMessage
// Strip the structural "A:" / "B:" prefix from an option label. The letter is already the row header,
// so "A:sequential" renders as just "sequential" to avoid the duplicate "A — A:sequential" artefact.
function stripOptionLetterPrefix(option: string): string {
  const match = /^\s*[A-Ea-e]\s*:\s*(.+)$/.exec(option);
  return match ? match[1]!.trim() : option.trim();
}

export function buildDetailsMessage(args: {
  projectName: string;
  correlationId: string;
  options: string[];
  details: Map<string, OptionDetail>;
}): string {
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const letters = ["A", "B", "C", "D", "E"];
  const lines: string[] = [];
  lines.push(`[${clean(args.projectName)}] Детали решения ${args.correlationId}`);
  lines.push("");
  args.options.slice(0, 5).forEach((option, index) => {
    const letter = letters[index]!;
    const detail = args.details.get(letter);
    const label = clean(stripOptionLetterPrefix(option));
    lines.push(`${letter} — ${label}`);
    if (!detail) {
      lines.push(`  (детали не переданы для ${letter})`);
      lines.push("");
      return;
    }
    lines.push(`  Преимущества: ${clean(detail.pros) || "—"}`);
    lines.push(`  Недостатки:   ${clean(detail.cons) || "—"}`);
    lines.push(`  Возможности:  ${clean(detail.opportunities) || "—"}`);
    lines.push(`  Риски:        ${clean(detail.risks) || "—"}`);
    lines.push("");
  });
  lines.push("Вернись к предыдущему сообщению и нажми A / B / C / PROCEED / DEFER / STOP.");
  return lines.join("\n");
}

// START_CONTRACT: buildAskKeyboard
//   PURPOSE: Construct the inline keyboard for a `grace afk ask` message. One row of A..E letters
//     (as many as the spec's options), one row of meta verbs. If hasDetails, a [Подробнее] button
//     is appended as a third row. Callback data = "<corrId>:<verb>".
//   INPUTS: { correlationId, options, hasDetails }
//   OUTPUTS: InlineKeyboard
//   SIDE_EFFECTS: none
// END_CONTRACT: buildAskKeyboard
export function buildAskKeyboard(
  correlationId: string,
  options: string[],
  hasDetails = false,
): InlineKeyboard {
  const letters = ["A", "B", "C", "D", "E"];
  const letterRow = options.slice(0, 5).map((_, index) => ({
    text: letters[index]!,
    callbackData: `${correlationId}:${letters[index]!}`,
  }));

  const rows: InlineKeyboard = [];
  if (letterRow.length > 0) {
    rows.push(letterRow);
  }
  rows.push([
    { text: "PROCEED", callbackData: `${correlationId}:PROCEED` },
    { text: "DEFER", callbackData: `${correlationId}:DEFER` },
    { text: "STOP", callbackData: `${correlationId}:STOP` },
  ]);
  if (hasDetails) {
    rows.push([{ text: "📖 Подробнее", callbackData: `${correlationId}:DETAILS` }]);
  }
  return rows;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-afk] Initial module. Post-review fixes:
//                - plain-text buildAskMessage (control-char stripping, no markdown)
//                - EXIT_TELEGRAM_FAILURE / EXIT_CONFIG_MISSING / EXIT_BAD_ARGS replace exit(1)
//                - --class validated against DECISION_CLASSES (no more silent garbage)
//                - --context canonical, --contextLine alias kept for back-compat
//                - dead tautology in report cmd removed
// END_CHANGE_SUMMARY
