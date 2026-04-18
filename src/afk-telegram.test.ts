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
  it("recognizes single letter options A-E", () => {
    expect(classifyAnswer("A").verb).toBe("A");
    expect(classifyAnswer("b").verb).toBe("B");
    expect(classifyAnswer(" c ").verb).toBe("C");
    expect(classifyAnswer("A").recognized).toBe(true);
  });

  it("recognizes verbs proceed / stop / evolve / defer", () => {
    expect(classifyAnswer("proceed").verb).toBe("PROCEED");
    expect(classifyAnswer("STOP").verb).toBe("STOP");
    expect(classifyAnswer("defer now").verb).toBe("DEFER");
  });

  it("returns UNKNOWN with recognized=false for free-form text", () => {
    const result = classifyAnswer("let me think about it");
    expect(result.verb).toBe("UNKNOWN");
    expect(result.recognized).toBe(false);
    expect(result.raw).toBe("let me think about it");
  });
});
