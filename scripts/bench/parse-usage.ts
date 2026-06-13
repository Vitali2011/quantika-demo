// Parse `claude --print --output-format json` output into usage metrics.
// Pure logic + a small CLI entrypoint (only fires when run directly via tsx).

export interface Usage {
  costUsd: number;
  durationMs: number;
  inTokens: number;
  outTokens: number;
  turns: number;
}

export function parseUsage(raw: string): Usage {
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("parse-usage: invalid JSON");
  }
  const u = o.usage ?? {};
  return {
    costUsd: Number(o.total_cost_usd ?? 0),
    durationMs: Number(o.duration_ms ?? 0),
    inTokens: Number(u.input_tokens ?? 0),
    outTokens: Number(u.output_tokens ?? 0),
    turns: Number(o.num_turns ?? 0),
  };
}

// CLI: `tsx parse-usage.ts <file.json>` → one TSV line. Guarded so it never
// fires under jest (argv[1] is the jest binary there, not this file).
if (process.argv[1] && process.argv[1].endsWith("parse-usage.ts") && process.argv[2]) {
   
  const fs = require("node:fs");
  const u = parseUsage(fs.readFileSync(process.argv[2], "utf8"));
  console.log(`${u.costUsd}\t${u.durationMs}\t${u.inTokens}\t${u.outTokens}\t${u.turns}`);
}
