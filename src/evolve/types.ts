// FILE: src/evolve/types.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Type surface for `grace evolve` — problem specs, metrics, candidates, trial results, archive.
//   SCOPE: Types only. No runtime logic. Zero dependencies.
//   DEPENDS: none
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-TYPES, skills/grace/grace-evolve/SKILL.md
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MetricDirection   - "higher-is-better" | "lower-is-better"
//   MetricSpec        - One metric: id, command, parser, direction, weight
//   StoppingCriteria  - Stop conditions: budget / target / convergence
//   ProblemSpec       - Full experiment specification (YAML-shape)
//   Candidate         - One candidate solution: id, patch path or branch, notes
//   MetricResult      - Parsed numeric result from a metric run
//   TrialVerdict      - "advance" | "vetoed" | "failed" | "skipped"
//   TrialResult       - All metrics for one candidate + verdict
//   EvolveArchive     - Full archive shape written to docs/experiments/<topic>/results.xml
// END_MODULE_MAP

export type MetricDirection = "higher-is-better" | "lower-is-better";

export type MetricSpec = {
  id: string;
  description?: string;
  command: string;
  // Regex with a single capture group that extracts the numeric value from stdout.
  // Default: /^\s*([-+]?\d+(?:\.\d+)?)\s*$/m — last numeric-only line.
  parser?: string;
  direction: MetricDirection;
  weight?: number;
  // If set, any trial value worse than this threshold fails the trial regardless of score.
  veto?: number;
};

export type StoppingCriteria = {
  maxCandidates?: number;
  maxSeconds?: number;
  targetScore?: number;
  // Stop if the best score has not improved across N consecutive trials.
  earlyStopAfterNoImprovement?: number;
};

export type ProblemSpec = {
  version: 1;
  topic: string;
  goal: string;
  metrics: MetricSpec[];
  stopping: StoppingCriteria;
  // Optional explicit list of candidates. In MVP this is the only source.
  candidates: Candidate[];
  // Optional setup script run once before any candidate (e.g. install deps).
  setup?: string;
  // Optional cleanup run after every candidate (e.g. reset DB).
  teardown?: string;
};

export type Candidate = {
  id: string;
  // Short human description: "dataloader with pin_memory=true".
  description?: string;
  // One of these must be provided.
  // A path to a .patch / .diff file applied on top of the base branch before running.
  patch?: string;
  // A git branch whose tip is used as the working tree (preferred when candidate is big).
  branch?: string;
  // Or, in-place: apply no changes, just run metrics against the base tree (baseline candidate).
  baseline?: boolean;
};

export type MetricResult = {
  metricId: string;
  command: string;
  rawStdout: string;
  value: number | null;
  parseError: string | null;
  durationMs: number;
  exitCode: number;
};

export type TrialVerdict = "advance" | "vetoed" | "failed" | "skipped";

export type TrialResult = {
  candidateId: string;
  startedAt: string;
  finishedAt: string;
  metrics: MetricResult[];
  // Weighted sum of normalized metric values (higher is always better).
  score: number | null;
  verdict: TrialVerdict;
  reason: string | null;
  // The worktree path where this candidate was evaluated.
  worktreePath: string;
};

export type EvolveArchive = {
  version: 1;
  topic: string;
  startedAt: string;
  finishedAt: string | null;
  spec: ProblemSpec;
  trials: TrialResult[];
  winnerCandidateId: string | null;
  stoppedBy: "budget" | "target" | "convergence" | "exhausted" | "error" | null;
};

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial type surface for the MVP (no LLM-critic loop).
// END_CHANGE_SUMMARY
