/**
 * Minimal Telegram Bot API transport used by `grace afk ask` and `grace afk check`.
 *
 * Uses native `fetch` by default; tests inject a mock via the `transport` parameter.
 * No external deps — avoids widening the CLI bundle.
 *
 * Docs: https://core.telegram.org/bots/api
 */

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
  const response = await transport(apiUrl(config, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "Markdown",
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
 * Everything else is returned verbatim for the agent to interpret, but flagged.
 */
export function classifyAnswer(text: string): { verb: string; raw: string; recognized: boolean } {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/).map((token) => token.toUpperCase().replace(/[^A-Z]/g, ""));
  const knownLetters = new Set(["A", "B", "C", "D", "E"]);
  const knownVerbs = new Set(["PROCEED", "STOP", "EVOLVE", "DEFER"]);

  for (const token of tokens) {
    if (knownLetters.has(token) || knownVerbs.has(token)) {
      return { verb: token, raw: trimmed, recognized: true };
    }
  }

  return { verb: "UNKNOWN", raw: trimmed, recognized: false };
}
