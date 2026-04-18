// FILE: src/afk/telegram.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Minimal Telegram Bot API transport for /afk one-way-door escalations.
//   SCOPE: sendMessage + getUpdates + reply matching + answer classification. Plain text only (no markdown parsing — user-controlled fields flow through, injection must be impossible).
//   DEPENDS: Web fetch API (injectable via `transport` param for tests)
//   LINKS: docs/knowledge-graph.xml#M-AFK-TELEGRAM, docs/verification-plan.xml#V-M-AFK-TELEGRAM, https://core.telegram.org/bots/api
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TelegramTransport   - Injectable fetch-compatible function signature used by tests
//   TelegramConfig      - Shape: { botToken, chatId }
//   SendMessageResult   - Shape: { ok, messageId?, errorDescription? }
//   IncomingReply       - Normalized update with chatId + optional fromMessageId
//   sendMessage         - POST to /sendMessage; returns message id on success
//   fetchUpdates        - GET /getUpdates; filters replies by chatId
//   matchReply          - Match a reply to a correlation id (via reply_to or prefix token)
//   classifyAnswer      - Strict classification into A-E / PROCEED / STOP / EVOLVE / DEFER / UNKNOWN
// END_MODULE_MAP

export type TelegramTransport = (url: string, init?: RequestInit) => Promise<Response>;

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type SendMessageResult = {
  ok: boolean;
  messageId?: number;
  errorDescription?: string;
};

export type IncomingReply = {
  updateId: number;
  text: string;
  chatId: string;
  fromMessageId?: number;
};

function apiUrl(config: TelegramConfig, method: string) {
  return `https://api.telegram.org/bot${config.botToken}/${method}`;
}

export async function sendMessage(
  config: TelegramConfig,
  text: string,
  transport: TelegramTransport = fetch,
): Promise<SendMessageResult> {
  // Plain text: user-controlled fields (titles, contexts from development-plan.xml) flow into
  // this transport. Previously parse_mode: "Markdown" permitted injection (clickable links,
  // broken formatting, weaponized `]` / `[` pairs). We intentionally send plain text and rely
  // on `buildAskMessage` to structure the payload with whitespace, not markdown syntax.
  const response = await transport(apiUrl(config, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const body = (await response.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };

  if (!body.ok) {
    return { ok: false, errorDescription: body.description };
  }

  return { ok: true, messageId: body.result?.message_id };
}

export async function fetchUpdates(
  config: TelegramConfig,
  offset: number | null,
  transport: TelegramTransport = fetch,
): Promise<IncomingReply[]> {
  const url = new URL(apiUrl(config, "getUpdates"));
  if (offset !== null) {
    url.searchParams.set("offset", String(offset));
  }
  url.searchParams.set("timeout", "0");
  url.searchParams.set("allowed_updates", '["message"]');

  const response = await transport(url.toString());
  const body = (await response.json()) as {
    ok: boolean;
    result?: Array<{
      update_id: number;
      message?: {
        text?: string;
        chat?: { id: number };
        reply_to_message?: { message_id: number };
      };
    }>;
  };

  if (!body.ok || !Array.isArray(body.result)) {
    return [];
  }

  const replies: IncomingReply[] = [];
  for (const update of body.result) {
    const text = update.message?.text;
    const chatId = update.message?.chat?.id;
    if (typeof text !== "string" || typeof chatId !== "number") {
      continue;
    }

    if (String(chatId) !== String(config.chatId)) {
      continue;
    }

    replies.push({
      updateId: update.update_id,
      text: text.trim(),
      chatId: String(chatId),
      fromMessageId: update.message?.reply_to_message?.message_id,
    });
  }

  return replies;
}

/**
 * Match an incoming reply to an outstanding question.
 *
 * Priority:
 * 1. Reply `reply_to_message` points at our correlation message id -> exact match.
 * 2. First whitespace-separated token equals the correlation id (hash-like string).
 * 3. Otherwise not matched.
 */
export function matchReply(reply: IncomingReply, correlationMessageId: number, correlationId: string) {
  if (reply.fromMessageId === correlationMessageId) {
    return true;
  }
  const firstToken = reply.text.split(/\s+/)[0]?.toLowerCase() ?? "";
  return firstToken === correlationId.toLowerCase();
}

/**
 * Normalize an answer into a decision verb that /afk understands.
 * Accepts: A/B/C/D/E, proceed, stop, evolve, defer (case-insensitive).
 *
 * Strict classification to prevent false positives on free-form text. Under the previous
 * "any token matches" rule, replies like "do not STOP", "I think we should PROCEED", or
 * "a cat" were all misclassified. The new rules:
 *
 *   1. Reject if the reply has more than 3 alphabetic tokens (free-form, not a short answer).
 *   2. Reject if any negation token (NO/NOT/DONT/NEVER/CANCEL) appears — ambiguous.
 *   3. Exactly one token must match the known verb/letter set.
 *   4. Single-letter matches (A-E) must be the only token (avoid "a cat" -> A).
 *
 * When in doubt, return UNKNOWN so the agent falls back to `grace afk defer` rather than
 * acting on a guessed classification for a one-way-door decision.
 */
const NEGATION_TOKENS = new Set(["NO", "NOT", "DONT", "NEVER", "CANCEL"]);
const KNOWN_LETTERS = new Set(["A", "B", "C", "D", "E"]);
const KNOWN_VERBS = new Set(["PROCEED", "STOP", "EVOLVE", "DEFER"]);

export function classifyAnswer(text: string): { verb: string; raw: string; recognized: boolean } {
  const trimmed = text.trim();
  const reject = () => ({ verb: "UNKNOWN", raw: trimmed, recognized: false });

  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.toUpperCase().replace(/[^A-Z]/g, ""))
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 3) {
    return reject();
  }

  const hasNegation = tokens.some((token) => NEGATION_TOKENS.has(token));
  const matches = tokens.filter((token) => KNOWN_LETTERS.has(token) || KNOWN_VERBS.has(token));

  if (hasNegation || matches.length !== 1) {
    return reject();
  }

  const match = matches[0]!;
  if (KNOWN_LETTERS.has(match) && tokens.length !== 1) {
    return reject();
  }

  return { verb: match, raw: trimmed, recognized: true };
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-afk] Initial module. Plain text only (no parse_mode: Markdown) —
//                title/context/options strings from development-plan.xml are user-controlled and
//                must not be able to inject markdown links or break formatting. Strict
//                classifyAnswer rejects multi-token, negated, or letter-in-free-text replies.
// END_CHANGE_SUMMARY
