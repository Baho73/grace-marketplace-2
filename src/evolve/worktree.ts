// FILE: src/evolve/worktree.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Create and tear down git worktrees for candidate isolation. Each candidate runs in its own working tree so a bad patch cannot corrupt the base repo.
//   SCOPE: worktree add / apply-patch / worktree remove. No metric execution. No archive writes.
//   DEPENDS: node:child_process, node:fs, node:os, node:path, ./types
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-WORKTREE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   prepareWorktree    - Create a worktree for one candidate and apply any patch
//   cleanupWorktree    - Remove a worktree (git worktree remove)
//   makeWorktreeRoot   - Resolve a per-session directory for worktrees
//   PrepareResult      - Discriminated union: ok with worktreePath / tempBranch, or error
// END_MODULE_MAP

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Candidate } from "./types";

export type PrepareResult =
  | { ok: true; worktreePath: string; tempBranch: string | null }
  | { ok: false; error: string };

export function makeWorktreeRoot(topic: string, sessionId: string): string {
  const safeTopic = topic.replace(/[^a-z0-9-_]/gi, "_");
  return path.join(os.tmpdir(), "grace-evolve", `${safeTopic}-${sessionId}`);
}

// START_CONTRACT: prepareWorktree
//   PURPOSE: Create an isolated working tree for a candidate.
//   INPUTS: { baseRepo, candidate, worktreeRoot }
//   OUTPUTS: PrepareResult with worktreePath or error
//   SIDE_EFFECTS: Runs `git worktree add`, optionally `git apply <patch>`. Creates files under worktreeRoot.
// END_CONTRACT: prepareWorktree
export function prepareWorktree(args: {
  baseRepo: string;
  candidate: Candidate;
  worktreeRoot: string;
}): PrepareResult {
  const { baseRepo, candidate, worktreeRoot } = args;
  if (!existsSync(worktreeRoot)) {
    mkdirSync(worktreeRoot, { recursive: true });
  }
  const target = path.join(worktreeRoot, `cand-${candidate.id}`);

  // START_BLOCK_SELECT_REF
  const refArgs: string[] = [];
  let tempBranch: string | null = null;
  if (candidate.baseline === true) {
    refArgs.push(target, "HEAD");
  } else if (candidate.branch) {
    refArgs.push(target, candidate.branch);
  } else if (candidate.patch) {
    tempBranch = `evolve/${candidate.id}-${Date.now()}`;
    refArgs.push("-b", tempBranch, target, "HEAD");
  } else {
    return { ok: false, error: `candidate ${candidate.id} has no source (set patch, branch, or baseline)` };
  }
  // END_BLOCK_SELECT_REF

  const add = gitExec(baseRepo, ["worktree", "add", ...refArgs]);
  if (add.exitCode !== 0) {
    return { ok: false, error: `git worktree add failed: ${add.stderr.trim() || add.stdout.trim()}` };
  }

  // START_BLOCK_APPLY_PATCH
  if (candidate.patch) {
    const patchAbs = path.resolve(baseRepo, candidate.patch);
    if (!existsSync(patchAbs)) {
      cleanupWorktree({ baseRepo, worktreePath: target, tempBranch });
      return { ok: false, error: `patch not found: ${patchAbs}` };
    }
    const apply = gitExec(target, ["apply", "--whitespace=nowarn", patchAbs]);
    if (apply.exitCode !== 0) {
      cleanupWorktree({ baseRepo, worktreePath: target, tempBranch });
      return { ok: false, error: `git apply failed: ${apply.stderr.trim() || apply.stdout.trim()}` };
    }
  }
  // END_BLOCK_APPLY_PATCH

  return { ok: true, worktreePath: target, tempBranch };
}

// START_CONTRACT: cleanupWorktree
//   PURPOSE: Remove a worktree created by prepareWorktree. Best-effort — ignores expected "not a worktree" errors.
//   INPUTS: { baseRepo, worktreePath, tempBranch? }
//   OUTPUTS: { ok, error? }
//   SIDE_EFFECTS: Invokes `git worktree remove --force` and deletes any lingering directory. Optionally deletes the temp branch.
// END_CONTRACT: cleanupWorktree
export function cleanupWorktree(args: {
  baseRepo: string;
  worktreePath: string;
  tempBranch?: string | null;
}): { ok: boolean; error: string | null } {
  const { baseRepo, worktreePath, tempBranch } = args;
  const remove = gitExec(baseRepo, ["worktree", "remove", "--force", worktreePath]);
  if (existsSync(worktreePath)) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  if (tempBranch) {
    gitExec(baseRepo, ["branch", "-D", tempBranch]);
  }
  if (remove.exitCode !== 0 && !remove.stderr.includes("not a working tree")) {
    return { ok: false, error: remove.stderr.trim() };
  }
  return { ok: true, error: null };
}

function gitExec(cwd: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Supports baseline / branch / patch candidate sources.
// END_CHANGE_SUMMARY
