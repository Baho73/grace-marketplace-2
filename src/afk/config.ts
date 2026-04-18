/**
 * Load `.grace-afk.json` from the project root.
 * Holds the Telegram bot token and chat id. Must be gitignored by the user —
 * grace-init will surface this in its post-run summary.
 */

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

export function getTelegram(config: AfkConfig | null) {
  if (!config?.telegram?.botToken || !config.telegram.chatId) {
    return null;
  }
  return { botToken: config.telegram.botToken, chatId: config.telegram.chatId };
}

export function getMaxEscalations(config: AfkConfig | null, fallback = 3) {
  const value = config?.autoStop?.maxEscalationsPerSession;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return fallback;
}
