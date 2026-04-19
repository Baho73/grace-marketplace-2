// FILE: src/evolve/metric.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Extract a numeric value from a command's stdout using either a regex parser or the default last-numeric-line rule.
//   SCOPE: Pure text parsing. No I/O. No execution.
//   DEPENDS: none
//   LINKS: docs/knowledge-graph.xml#M-EVOLVE-METRIC
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   parseMetricOutput   - Return { value, error } from stdout + optional regex source
//   DEFAULT_PARSER      - Last purely-numeric line in the output
// END_MODULE_MAP

export const DEFAULT_PARSER = "^\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*$";

// START_CONTRACT: parseMetricOutput
//   PURPOSE: Pull a number out of a metric command's stdout.
//   INPUTS: { stdout: string, parser?: string - regex source with one capture group }
//   OUTPUTS: { value: number | null, error: string | null }
//   SIDE_EFFECTS: none
// END_CONTRACT: parseMetricOutput
export function parseMetricOutput(stdout: string, parser?: string): { value: number | null; error: string | null } {
  const source = parser ?? DEFAULT_PARSER;
  let regex: RegExp;
  try {
    regex = new RegExp(source, "m");
  } catch (error) {
    return {
      value: null,
      error: `Invalid parser regex: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!parser) {
    const lines = stdout.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const match = regex.exec(lines[index] ?? "");
      if (match && match[1] !== undefined) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed)) {
          return { value: parsed, error: null };
        }
      }
    }
    return { value: null, error: "No numeric-only line found in stdout (default parser)." };
  }

  const match = regex.exec(stdout);
  if (!match) {
    return { value: null, error: `Parser regex did not match stdout.` };
  }
  const captured = match[1];
  if (captured === undefined) {
    return { value: null, error: "Parser regex matched but has no capture group." };
  }
  const parsed = Number(captured);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `Captured "${captured}" is not a finite number.` };
  }
  return { value: parsed, error: null };
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [3.7.0-grace-evolve] Initial. Default parser picks the last numeric-only line.
// END_CHANGE_SUMMARY
