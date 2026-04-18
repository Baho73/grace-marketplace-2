/**
 * /afk session state.
 *
 * Budget enforcement is done by the CLI, NOT by the agent. The agent cannot rationalize
 * its way around an expired session because any `grace afk *` command first checks
 * expiresAt and exits with `BUDGET_EXHAUSTED` if it has passed.
 *
 * State file: `docs/afk-sessions/<ts>/state.json` — one session per timestamped directory.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type SessionStatus = "active" | "expired" | "stopped" | "completed";

export type SessionState = {
  version: 1;
  id: string;
  createdAt: string;
  expiresAt: string;
  hours: number;
  budgetPercent: number | null;
  checkpointMinutes: number;
  status: SessionStatus;
  commits: number;
  escalations: number;
  deferred: number;
  lastTickAt: string | null;
  stopReason: string | null;
};

const STATE_FILENAME = "state.json";

function toIso(date: Date) {
  return date.toISOString();
}

function sessionsRoot(projectRoot: string) {
  return path.join(projectRoot, "docs", "afk-sessions");
}

function sessionDir(projectRoot: string, sessionId: string) {
  return path.join(sessionsRoot(projectRoot), sessionId);
}

function statePath(projectRoot: string, sessionId: string) {
  return path.join(sessionDir(projectRoot, sessionId), STATE_FILENAME);
}

export function newSessionId(now = new Date()) {
  // Compact ISO-ish id, safe for paths across Windows/Linux.
  return now
    .toISOString()
    .replace(/[:.]/g, "")
    .replace(/Z$/, "Z")
    .slice(0, 17);
}

export function createSession(
  projectRoot: string,
  args: { hours: number; budgetPercent?: number | null; checkpointMinutes?: number },
  now: Date = new Date(),
): SessionState {
  const hours = Number(args.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error(`hours must be in (0, 24], got ${args.hours}`);
  }

  const checkpointMinutes = args.checkpointMinutes ?? 30;
  if (!Number.isFinite(checkpointMinutes) || checkpointMinutes < 5 || checkpointMinutes > 180) {
    throw new Error(`--checkpoint must be in [5, 180] minutes, got ${checkpointMinutes}`);
  }

  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);
  const id = newSessionId(now);
  const state: SessionState = {
    version: 1,
    id,
    createdAt: toIso(now),
    expiresAt: toIso(expiresAt),
    hours,
    budgetPercent: args.budgetPercent ?? null,
    checkpointMinutes,
    status: "active",
    commits: 0,
    escalations: 0,
    deferred: 0,
    lastTickAt: null,
    stopReason: null,
  };

  const dir = sessionDir(projectRoot, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(projectRoot, id), JSON.stringify(state, null, 2));
  return state;
}

export function listSessions(projectRoot: string): string[] {
  const root = sessionsRoot(projectRoot);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .filter((name) => statSync(path.join(root, name)).isDirectory())
    .sort();
}

export function findActiveSession(projectRoot: string, now: Date = new Date()): SessionState | null {
  const ids = listSessions(projectRoot);
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index]!;
    const state = readSession(projectRoot, id);
    if (!state) {
      continue;
    }
    if (state.status === "active" && new Date(state.expiresAt).getTime() > now.getTime()) {
      return state;
    }
  }
  return null;
}

export function readSession(projectRoot: string, sessionId: string): SessionState | null {
  const file = statePath(projectRoot, sessionId);
  if (!existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as SessionState;
  } catch {
    return null;
  }
}

export function writeSession(projectRoot: string, state: SessionState) {
  const dir = sessionDir(projectRoot, state.id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(statePath(projectRoot, state.id), JSON.stringify(state, null, 2));
}

export type ActiveSessionCheck =
  | { ok: true; session: SessionState; remainingMs: number }
  | { ok: false; reason: "no-active-session" | "expired" | "stopped"; session: SessionState | null; remainingMs: number };

export function checkActive(projectRoot: string, now: Date = new Date()): ActiveSessionCheck {
  const session = findActiveSession(projectRoot, now);
  if (!session) {
    const latestId = listSessions(projectRoot).slice(-1)[0];
    const latest = latestId ? readSession(projectRoot, latestId) : null;
    if (latest && latest.status === "stopped") {
      return { ok: false, reason: "stopped", session: latest, remainingMs: 0 };
    }
    if (latest && new Date(latest.expiresAt).getTime() <= now.getTime()) {
      return { ok: false, reason: "expired", session: latest, remainingMs: 0 };
    }
    return { ok: false, reason: "no-active-session", session: latest, remainingMs: 0 };
  }

  const remainingMs = new Date(session.expiresAt).getTime() - now.getTime();
  return { ok: true, session, remainingMs };
}

export function markStopped(
  projectRoot: string,
  sessionId: string,
  reason: string,
  now: Date = new Date(),
): SessionState | null {
  const state = readSession(projectRoot, sessionId);
  if (!state) {
    return null;
  }
  state.status = "stopped";
  state.stopReason = reason;
  state.lastTickAt = toIso(now);
  writeSession(projectRoot, state);
  return state;
}

export function markCompleted(projectRoot: string, sessionId: string, now: Date = new Date()): SessionState | null {
  const state = readSession(projectRoot, sessionId);
  if (!state) {
    return null;
  }
  state.status = "completed";
  state.lastTickAt = toIso(now);
  writeSession(projectRoot, state);
  return state;
}

export function incrementCounter(
  projectRoot: string,
  sessionId: string,
  field: "commits" | "escalations" | "deferred",
  now: Date = new Date(),
): SessionState | null {
  const state = readSession(projectRoot, sessionId);
  if (!state) {
    return null;
  }
  state[field] += 1;
  state.lastTickAt = toIso(now);
  writeSession(projectRoot, state);
  return state;
}

export function updateLastTick(projectRoot: string, sessionId: string, now: Date = new Date()): SessionState | null {
  const state = readSession(projectRoot, sessionId);
  if (!state) {
    return null;
  }
  state.lastTickAt = toIso(now);
  writeSession(projectRoot, state);
  return state;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) {
    return "0m";
  }
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export const EXIT_BUDGET_EXHAUSTED = 42;
export const EXIT_NO_SESSION = 43;
export const EXIT_SESSION_STOPPED = 44;

export function resolveSessionPaths(projectRoot: string, sessionId: string) {
  const dir = sessionDir(projectRoot, sessionId);
  return {
    dir,
    statePath: statePath(projectRoot, sessionId),
    decisionsPath: path.join(dir, "decisions.md"),
    deferredPath: path.join(dir, "deferred.md"),
    dashboardPath: path.join(dir, "dashboard.md"),
  };
}
