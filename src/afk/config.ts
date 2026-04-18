// FILE: src/afk/config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Parse .grace-afk.json holding Telegram credentials and autoStop caps for /afk sessions.
//   SCOPE: Read-only config loading + accessor helpers. No I/O beyond fs.readFileSync.
//   DEPENDS: node:fs, node:path
//   LINKS: docs/knowledge-graph.xml#M-AFK-CONFIG, docs/verification-plan.xml#V-M-AFK-CONFIG
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AfkConfig          - Shape of .grace-afk.json: telegram credentials + autoStop caps
//   loadAfkConfig      - Read and parse .grace-afk.json; returns null+error on any failure
//   getTelegram        - Extract botToken/chatId; returns null if either missing
//   getMaxEscalations  - Resolve per-session escalation cap; default 3
// END_MODULE_MAP

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type AfkConfig = {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  autoStop?: {
    maxEscalationsPerSession?: number;
  };
};

const CONFIG_FILE = ".grace-afk.json";

// START_CONTRACT: loadAfkConfig
//   PURPOSE: Read .grace-afk.json and return its parsed form, or a reason for not loading it.
//   INPUTS: { projectRoot: string - absolute path to the project root }
//   OUTPUTS: { config: AfkConfig | null, error: string | null } - exactly one side is populated
//   SIDE_EFFECTS: Reads the file system. Never throws — all failures are returned in `error`.
// END_CONTRACT: loadAfkConfig
export function loadAfkConfig(projectRoot: string): { config: AfkConfig | null; error: string | null } {
  const filePath = path.join(projectRoot, CONFIG_FILE);
  if (!existsSync(filePath)) {
    return { config: null, error: `${CONFIG_FILE} not found in ${projectRoot}` };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as AfkConfig;
    return { config: parsed, error: null };
  } catch (error) {
    return {
      config: null,
      error: `Failed to parse ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// START_CONTRACT: getTelegram
//   PURPOSE: Return Telegram credentials only when both botToken and chatId are present.
//   INPUTS: { config: AfkConfig | null }
//   OUTPUTS: { botToken: string, chatId: string } | null
//   SIDE_EFFECTS: none
// END_CONTRACT: getTelegram
export function getTelegram(config: AfkConfig | null) {
  if (!config?.telegram?.botToken || !config.telegram.chatId) {
    return null;
  }
  return { botToken: config.telegram.botToken, chatId: config.telegram.chatId };
}

// START_CONTRACT: getMaxEscalations
//   PURPOSE: Resolve the per-session Telegram-escalation cap with a safe default.
//   INPUTS: { config: AfkConfig | null, fallback?: number - default 3 }
//   OUTPUTS: number - finite, non-negative
//   SIDE_EFFECTS: none
// END_CONTRACT: getMaxEscalations
export function getMaxEscalations(config: AfkConfig | null, fallback = 3) {
  const value = config?.autoStop?.maxEscalationsPerSession;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return fallback;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-afk] Initial module for Telegram/autoStop config in .grace-afk.json
// END_CHANGE_SUMMARY
