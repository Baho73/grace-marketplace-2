import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { getMaxEscalations, getTelegram, loadAfkConfig } from "./afk/config";

function tmpProject() {
  return mkdtempSync(path.join(os.tmpdir(), "grace-afk-config-"));
}

describe("loadAfkConfig", () => {
  it("returns null + descriptive error when file is missing", () => {
    const root = tmpProject();
    const { config, error } = loadAfkConfig(root);

    expect(config).toBeNull();
    expect(error).toContain(".grace-afk.json not found");
  });

  it("parses a valid config", () => {
    const root = tmpProject();
    writeFileSync(
      path.join(root, ".grace-afk.json"),
      JSON.stringify({
        telegram: { botToken: "abc", chatId: "123" },
        autoStop: { maxEscalationsPerSession: 5 },
      }),
    );

    const { config, error } = loadAfkConfig(root);

    expect(error).toBeNull();
    expect(config?.telegram?.botToken).toBe("abc");
    expect(config?.telegram?.chatId).toBe("123");
    expect(config?.autoStop?.maxEscalationsPerSession).toBe(5);
  });

  it("returns null + error on invalid JSON", () => {
    const root = tmpProject();
    writeFileSync(path.join(root, ".grace-afk.json"), "{ not valid json");

    const { config, error } = loadAfkConfig(root);

    expect(config).toBeNull();
    expect(error).toContain("Failed to parse");
  });
});

describe("getTelegram", () => {
  it("returns null if config is null", () => {
    expect(getTelegram(null)).toBeNull();
  });

  it("returns null if botToken is missing", () => {
    expect(getTelegram({ telegram: { botToken: "", chatId: "1" } })).toBeNull();
  });

  it("returns null if chatId is missing", () => {
    expect(getTelegram({ telegram: { botToken: "1", chatId: "" } })).toBeNull();
  });

  it("returns the credentials when both are present", () => {
    const result = getTelegram({ telegram: { botToken: "token", chatId: "chat" } });
    expect(result).toEqual({ botToken: "token", chatId: "chat" });
  });
});

describe("getMaxEscalations", () => {
  it("defaults to 3 when config is null", () => {
    expect(getMaxEscalations(null)).toBe(3);
  });

  it("defaults to 3 when autoStop is not set", () => {
    expect(getMaxEscalations({})).toBe(3);
  });

  it("honors a configured value", () => {
    expect(getMaxEscalations({ autoStop: { maxEscalationsPerSession: 7 } })).toBe(7);
  });

  it("falls back when configured value is negative or non-finite", () => {
    expect(getMaxEscalations({ autoStop: { maxEscalationsPerSession: -1 } })).toBe(3);
    expect(getMaxEscalations({ autoStop: { maxEscalationsPerSession: Number.NaN } })).toBe(3);
  });

  it("accepts a custom fallback", () => {
    expect(getMaxEscalations(null, 10)).toBe(10);
  });
});
