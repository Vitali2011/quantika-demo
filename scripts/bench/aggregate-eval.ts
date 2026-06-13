// Pure aggregation for the plan+recon eval + a thin CLI. Pure functions are unit-tested;
// the CLI (guarded to fire only under tsx) walks the results/grades dirs and prints tables.

export interface ReconVerdict {
  root?: number;
  location?: number;
}
export interface ReconAgg {
  n: number;
  meanRoot: number;
  meanLocation: number;
}

export function meanReconScore(rows: ReconVerdict[]): ReconAgg {
  const valid = rows.filter((r) => typeof r.root === "number");
  if (valid.length === 0) return { n: 0, meanRoot: 0, meanLocation: 0 };
  const sum = (f: (r: ReconVerdict) => number) => valid.reduce((a, r) => a + f(r), 0);
  return {
    n: valid.length,
    meanRoot: sum((r) => r.root ?? 0) / valid.length,
    meanLocation: sum((r) => r.location ?? 0) / valid.length,
  };
}

// Extract the "passed" number from a jest "Tests:" summary line.
export function parsePassCount(summary: string): number {
  const m = summary.match(/(\d+)\s+passed/);
  return m ? Number(m[1]) : 0;
}

export function meanPassCount(counts: number[]): { n: number; mean: number } {
  if (counts.length === 0) return { n: 0, mean: 0 };
  return { n: counts.length, mean: counts.reduce((a, b) => a + b, 0) / counts.length };
}

// CLI: print per-config recon means + plan pass-count means. Guarded so jest never triggers it.
if (process.argv[1] && process.argv[1].endsWith("aggregate-eval.ts")) {
  const fs = require("node:fs");
  const path = require("node:path");
  const ROOT = process.cwd();
  const base = path.join(ROOT, "bench/plan-recon");

  const readJSON = (p: string): any => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return {};
    }
  };
  const dirs = (p: string): string[] => {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  };

  console.log("=== RECON (mean root /2, location /1) ===");
  for (const task of dirs(path.join(base, "grades"))) {
    if (!task.startsWith("recon-")) continue;
    for (const arm of dirs(path.join(base, "grades", task))) {
      const rows: ReconVerdict[] = [];
      for (const run of dirs(path.join(base, "grades", task, arm))) {
        rows.push(readJSON(path.join(base, "grades", task, arm, run, "scores.json")));
      }
      const a = meanReconScore(rows);
      console.log(
        `${task}\t${arm}\tn=${a.n}\troot=${a.meanRoot.toFixed(2)}\tloc=${a.meanLocation.toFixed(2)}`,
      );
    }
  }

  console.log("=== PLAN (mean #957 passed) ===");
  const pgrades = path.join(base, "grades");
  for (const arm of dirs(pgrades)) {
    if (!arm.startsWith("planexec-")) continue;
    const counts: number[] = [];
    for (const run of dirs(path.join(pgrades, arm))) {
      const sumPath = path.join(pgrades, arm, run, "h957.summary");
      try {
        counts.push(parsePassCount(fs.readFileSync(sumPath, "utf8")));
      } catch {
        /* skip */
      }
    }
    const m = meanPassCount(counts);
    console.log(`${arm}\tn=${m.n}\tpassed=${m.mean.toFixed(2)}`);
  }
}
