import { describe, expect, it } from "bun:test";

import {
  classifyAnswer,
  fetchUpdates,
  matchReply,
  sendMessage,
  type TelegramTransport,
} from "./afk/telegram";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockTransport(entries: Array<{ test: (url: string) => boolean; body: unknown }>): {
  transport: TelegramTransport;
  calls: string[];
} {
  const calls: string[] = [];
  const transport: TelegramTransport = async (url) => {
    calls.push(url);
    for (const entry of entries) {
      if (entry.test(url)) {
        return okResponse(entry.body);
      }
    }
    return okResponse({ ok: false, description: "no mock for " + url });
  };
  return { transport, calls };
}

describe("telegram sendMessage", () => {
  it("posts to sendMessage and returns messageId on success", async () => {
    const { transport, calls } = mockTransport([
      { test: (url) => url.endsWith("/sendMessage"), body: { ok: true, result: { message_id: 42 } } },
    ]);

    const result = await sendMessage({ botToken: "t", chatId: "123" }, "hello", transport);

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe(42);
    expect(calls[0]).toContain("/bott/sendMessage");
  });

  it("returns ok=false with error description on failure", async () => {
    const { transport } = mockTransport([
      { test: (url) => url.endsWith("/sendMessage"), body: { ok: false, description: "chat not found" } },
    ]);

    const result = await sendMessage({ botToken: "t", chatId: "123" }, "hello", transport);

    expect(result.ok).toBe(false);
    expect(result.errorDescription).toBe("chat not found");
  });
});

describe("telegram fetchUpdates", () => {
  it("returns replies only from matching chat id", async () => {
    const { transport } = mockTransport([
      {
        test: (url) => url.includes("/getUpdates"),
        body: {
          ok: true,
          result: [
            { update_id: 1, message: { text: "A", chat: { id: 123 } } },
            { update_id: 2, message: { text: "ignore", chat: { id: 999 } } },
            { update_id: 3, message: { text: "B", chat: { id: 123 }, reply_to_message: { message_id: 42 } } },
          ],
        },
      },
    ]);

    const replies = await fetchUpdates({ botToken: "t", chatId: "123" }, null, transport);

    expect(replies).toHaveLength(2);
    expect(replies[0]?.text).toBe("A");
    expect(replies[1]?.fromMessageId).toBe(42);
  });

  it("passes offset when provided", async () => {
    const { transport, calls } = mockTransport([
      { test: (url) => url.includes("/getUpdates"), body: { ok: true, result: [] } },
    ]);

    await fetchUpdates({ botToken: "t", chatId: "1" }, 500, transport);

    expect(calls[0]).toContain("offset=500");
  });
});

describe("matchReply", () => {
  it("matches by reply_to_message_id", () => {
    const reply = { updateId: 1, text: "B", chatId: "1", fromMessageId: 42 };
    expect(matchReply(reply, 42, "xyz")).toBe(true);
    expect(matchReply(reply, 99, "xyz")).toBe(false);
  });

  it("matches by first token equal to correlation id", () => {
    const reply = { updateId: 1, text: "abc123 B", chatId: "1" };
    expect(matchReply(reply, 0, "abc123")).toBe(true);
    expect(matchReply(reply, 0, "nomatch")).toBe(false);
  });
});

describe("classifyAnswer", () => {
  it("recognizes single letter options A-E when the letter stands alone", () => {
    expect(classifyAnswer("A").verb).toBe("A");
    expect(classifyAnswer("b").verb).toBe("B");
    expect(classifyAnswer(" c ").verb).toBe("C");
    expect(classifyAnswer("A").recognized).toBe(true);
  });

  it("recognizes verbs proceed / stop / evolve / defer", () => {
    expect(classifyAnswer("proceed").verb).toBe("PROCEED");
    expect(classifyAnswer("STOP").verb).toBe("STOP");
    expect(classifyAnswer("defer now").verb).toBe("DEFER");
    expect(classifyAnswer("yes proceed").verb).toBe("PROCEED");
  });

  it("recognizes an answer prefixed by a correlation id", () => {
    expect(classifyAnswer("abc123 PROCEED").verb).toBe("PROCEED");
    expect(classifyAnswer("abc123 STOP").verb).toBe("STOP");
  });

  it("returns UNKNOWN with recognized=false for free-form text", () => {
    const result = classifyAnswer("let me think about it");
    expect(result.verb).toBe("UNKNOWN");
    expect(result.recognized).toBe(false);
    expect(result.raw).toBe("let me think about it");
  });

  it("rejects replies containing a negation alongside a verb", () => {
    expect(classifyAnswer("do not STOP").recognized).toBe(false);
    expect(classifyAnswer("dont proceed").recognized).toBe(false);
    expect(classifyAnswer("never defer").recognized).toBe(false);
    expect(classifyAnswer("cancel PROCEED").recognized).toBe(false);
  });

  it("rejects free-form replies longer than 3 tokens even if a verb appears", () => {
    expect(classifyAnswer("I think we should PROCEED").recognized).toBe(false);
    expect(classifyAnswer("do not STOP do not PROCEED").recognized).toBe(false);
  });

  it("rejects single letters embedded in free-form text (regression: 'a cat' -> A)", () => {
    expect(classifyAnswer("a cat").recognized).toBe(false);
    expect(classifyAnswer("B please").recognized).toBe(false);
    expect(classifyAnswer("option C maybe").recognized).toBe(false);
  });

  it("rejects empty / whitespace-only replies", () => {
    expect(classifyAnswer("").recognized).toBe(false);
    expect(classifyAnswer("   ").recognized).toBe(false);
  });
});
