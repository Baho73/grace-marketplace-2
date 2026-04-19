// FILE: src/evolve/orchestrator.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Drive the full evolve loop: for each candidate in the spec, prepare a worktree, run metrics, score the cohort, apply stopping criteria, produce an archive.
//   SCOPE: Orchestration only. Delegates worktree management, runner, scoring, and archive writing to the dedicated modules.
//   DEPENDS: ./runner, ./worktree, ./score, ./archive, ./types
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-ORCHESTRATOR
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   runEvolve         - Top-level loop; returns a finalized EvolveArchive
//   Progress          - Callback surface for streaming status to CLI output
// END_MODULE_MAP

import path from "node:path";

import { writeArchive } from "./archive";
import { cleanupWorktree, makeWorktreeRoot, prepareWorktree } from "./worktree";
import { makeDefaultDeps, runCandidate, type RunnerDeps } from "./runner";
import { hasVeto, scoreTrials } from "./score";
import type { EvolveArchive, ProblemSpec, TrialResult } from "./types";

export type Progress = (event: {
  kind: "start" | "candidate-started" | "candidate-finished" | "stopped" | "archived";
  message: string;
  candidateId?: string;
  score?: number | null;
}) => void;

// START_CONTRACT: runEvolve
//   PURPOSE: Execute the evolve loop end-to-end.
//   INPUTS: { projectRoot, spec, sessionId, deps?, progress?, perCommandTimeoutMs? }
//   OUTPUTS: { archive: EvolveArchive, archivePath: string }
//   SIDE_EFFECTS: Creates and removes git worktrees. Writes docs/experiments/<topic>/results.xml.
// END_CONTRACT: runEvolve
export async function runEvolve(args: {
  projectRoot: string;
  spec: ProblemSpec;
  sessionId: string;
  deps?: RunnerDeps;
  progress?: Progress;
  perCommandTimeoutMs?: number;
}): Promise<{ archive: EvolveArchive; archivePath: string }> {
  const { projectRoot, spec, sessionId, perCommandTimeoutMs } = args;
  const deps = args.deps ?? makeDefaultDeps();
  const progress = args.progress ?? (() => {});
  const worktreeRoot = makeWorktreeRoot(spec.topic, sessionId);

  const archive: EvolveArchive = {
    version: 1,
    topic: spec.topic,
    startedAt: deps.now().toISOString(),
    finishedAt: null,
    spec,
    trials: [],
    winnerCandidateId: null,
    stoppedBy: null,
  };

  progress({ kind: "start", message: `evolve started with ${spec.candidates.length} candidate(s), topic=${spec.topic}` });

  // START_BLOCK_STOPPING_TRACKERS
  const startedAtMs = Date.now();
  let bestScore = -Infinity;
  let noImprovementStreak = 0;
  // END_BLOCK_STOPPING_TRACKERS

  for (const candidate of spec.candidates) {
    // START_BLOCK_BUDGET_CHECKS
    if (
      spec.stopping.maxCandidates !== undefined &&
      archive.trials.length >= spec.stopping.maxCandidates
    ) {
      archive.stoppedBy = "budget";
      progress({ kind: "stopped", message: `stopped by maxCandidates=${spec.stopping.maxCandidates}` });
      break;
    }
    if (
      spec.stopping.maxSeconds !== undefined &&
      Date.now() - startedAtMs >= spec.stopping.maxSeconds * 1000
    ) {
      archive.stoppedBy = "budget";
      progress({ kind: "stopped", message: `stopped by maxSeconds=${spec.stopping.maxSeconds}` });
      break;
    }
    // END_BLOCK_BUDGET_CHECKS

    progress({ kind: "candidate-started", message: `running ${candidate.id}`, candidateId: candidate.id });

    const prep = prepareWorktree({ baseRepo: projectRoot, candidate, worktreeRoot });
    let trial: TrialResult;
    if (!prep.ok) {
      trial = {
        candidateId: candidate.id,
        startedAt: deps.now().toISOString(),
        finishedAt: deps.now().toISOString(),
        metrics: [],
        score: null,
        verdict: "failed",
        reason: prep.error,
        worktreePath: "",
      };
    } else {
      trial = runCandidate({
        candidate,
        spec,
        worktreePath: prep.worktreePath,
        deps,
        perCommandTimeoutMs,
      });
      const veto = hasVeto(trial.metrics, spec.metrics);
      if (veto.vetoed && trial.verdict === "advance") {
        trial.verdict = "vetoed";
        trial.reason = veto.reason;
      }
      cleanupWorktree({ baseRepo: projectRoot, worktreePath: prep.worktreePath, tempBranch: prep.tempBranch });
    }

    archive.trials.push(trial);

    // START_BLOCK_RESCORE_COHORT
    const scores = scoreTrials(
      archive.trials.map((item) => ({ candidateId: item.candidateId, metrics: item.metrics })),
      spec.metrics,
    );
    for (const item of archive.trials) {
      const value = scores.get(item.candidateId);
      item.score = value ?? null;
      if (item.verdict === "vetoed" || item.verdict === "failed") {
        item.score = null;
      }
    }
    const trialScore = trial.score ?? null;
    // END_BLOCK_RESCORE_COHORT

    progress({
      kind: "candidate-finished",
      message: `${candidate.id} verdict=${trial.verdict} score=${trialScore ?? "—"}`,
      candidateId: candidate.id,
      score: trialScore,
    });

    // START_BLOCK_EARLY_STOP
    const improved = trialScore !== null && trialScore > bestScore;
    if (improved) {
      bestScore = trialScore;
      noImprovementStreak = 0;
    } else if (trialScore !== null) {
      noImprovementStreak += 1;
    }
    if (spec.stopping.targetScore !== undefined && bestScore >= spec.stopping.targetScore) {
      archive.stoppedBy = "target";
      progress({
        kind: "stopped",
        message: `stopped by targetScore=${spec.stopping.targetScore} (best=${bestScore})`,
      });
      break;
    }
    if (
      spec.stopping.earlyStopAfterNoImprovement !== undefined &&
      noImprovementStreak >= spec.stopping.earlyStopAfterNoImprovement
    ) {
      archive.stoppedBy = "convergence";
      progress({
        kind: "stopped",
        message: `stopped after ${noImprovementStreak} trials without improvement`,
      });
      break;
    }
    // END_BLOCK_EARLY_STOP
  }

  if (archive.stoppedBy === null) {
    archive.stoppedBy = "exhausted";
  }

  // START_BLOCK_PICK_WINNER
  let winner: TrialResult | null = null;
  for (const trial of archive.trials) {
    if (trial.score === null) {
      continue;
    }
    if (!winner || (winner.score !== null && trial.score > winner.score)) {
      winner = trial;
    }
  }
  archive.winnerCandidateId = winner?.candidateId ?? null;
  archive.finishedAt = deps.now().toISOString();
  // END_BLOCK_PICK_WINNER

  const written = writeArchive(projectRoot, archive);
  progress({ kind: "archived", message: `archive written to ${path.relative(projectRoot, written)}` });

  return { archive, archivePath: written };
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Sequential loop with stopping criteria and cohort rescoring.
// END_CHANGE_SUMMARY
