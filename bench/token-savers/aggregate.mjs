#!/usr/bin/env node
// aggregate.mjs — fold test results + judge votes + probe recall → RESULTS.md
import fs from "fs";
import path from "path";

const BASE = new URL(".", import.meta.url).pathname;
const RUNS = path.join(BASE, "runs");
const GRADES = path.join(BASE, "grades");
const PROBE_ORACLE = path.join(BASE, "tasks", "probe", "oracle.txt");

const FEATURE_TASKS = ["pr964", "pr965", "pr970"];
const ARMS = ["baseline", "caveman", "rtk", "cavecrew", "all"];
const REPS = [1, 2, 3];

function readFile(p) {
  try { return fs.readFileSync(p, "utf8").trim(); } catch { return null; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

// --- Oracle pass-rate per (task, arm) ---
const passRate = {};   // passRate[task][arm] = {pass, total}
const costMean = {};   // costMean[task][arm] = mean total_cost_usd

for (const task of FEATURE_TASKS) {
  passRate[task] = {};
  costMean[task] = {};
  for (const arm of ARMS) {
    let pass = 0, total = 0, costSum = 0, costCount = 0;
    for (const r of REPS) {
      const cell = path.join(RUNS, task, arm, `r${r}`);
      const oracle = readFile(path.join(cell, "oracle.txt"));
      if (oracle !== null) { total++; if (oracle === "PASS") pass++; }
      const j = readJson(path.join(cell, "result.json"));
      if (j?.total_cost_usd) { costSum += j.total_cost_usd; costCount++; }
    }
    passRate[task][arm] = { pass, total };
    costMean[task][arm] = costCount ? (costSum / costCount).toFixed(4) : "—";
  }
}

// --- Pairwise judge win-rate per (task, feat) ---
// win-rate = fraction of judged duels where baseline wins (high = baseline better)
const judgeWin = {};  // judgeWin[task][feat] = {baselineWins, total}
for (const task of FEATURE_TASKS) {
  judgeWin[task] = {};
  for (const feat of ["caveman", "rtk", "cavecrew", "all"]) {
    let baselineWins = 0, total = 0;
    for (const r of REPS) {
      const raw = readFile(path.join(GRADES, task, feat, `r${r}.raw`));
      const aslot = readFile(path.join(GRADES, task, feat, `r${r}.Aslot`));
      if (!raw || !aslot) continue;
      total++;
      const winner = raw.trim().slice(0, 1).toUpperCase();
      const Aarm = aslot.trim();
      const winnerArm = (winner === "A") ? Aarm : (Aarm === "baseline" ? feat : "baseline");
      if (winnerArm === "baseline") baselineWins++;
    }
    judgeWin[task][feat] = { baselineWins, total };
  }
}

// --- Probe recall per arm (baseline, rtk, all) ---
const oracleLines = readFile(PROBE_ORACLE)?.split("\n").filter(Boolean) ?? [];
const probeRecall = {};
for (const arm of ["baseline", "rtk", "all"]) {
  let totalRecall = 0, repCount = 0;
  for (const r of REPS) {
    const cell = path.join(RUNS, "probe", arm, `r${r}`);
    const j = readJson(path.join(cell, "result.json"));
    if (!j) continue;
    const agentOut = (j.result || "").toLowerCase();
    const found = oracleLines.filter(loc => {
      const key = loc.split("—")[0].trim().toLowerCase();
      return agentOut.includes(key);
    }).length;
    totalRecall += found / oracleLines.length;
    repCount++;
  }
  probeRecall[arm] = repCount ? (totalRecall / repCount).toFixed(2) : "—";
}

// --- Verdict per feature ---
// HURTS if pass-rate across tasks drops >1 cell below baseline OR judge win-rate for baseline >55%
function verdict(feat) {
  let passDrops = 0;
  let judgeBaselineAdv = 0, judgeDuels = 0;
  for (const task of FEATURE_TASKS) {
    const bl = passRate[task].baseline;
    const ft = passRate[task][feat];
    if (bl.total > 0 && ft.total > 0) {
      const blRate = bl.pass / bl.total;
      const ftRate = ft.pass / ft.total;
      if (blRate - ftRate > 1 / 3) passDrops++;  // >1 cell drop
    }
    const j = judgeWin[task]?.[feat];
    if (j && j.total > 0) {
      judgeBaselineAdv += j.baselineWins;
      judgeDuels += j.total;
    }
  }
  const judgeBaselineRate = judgeDuels ? judgeBaselineAdv / judgeDuels : 0.5;
  if (passDrops >= 2 || judgeBaselineRate > 0.55) return "**HURTS**";
  return "NEUTRAL";
}

// --- Render RESULTS.md ---
const lines = [];
lines.push("# Token-Savers Quality Eval — RESULTS");
lines.push("");
lines.push(`Generated: ${new Date().toISOString().slice(0,16)} UTC`);
lines.push("");
lines.push("## Oracle Pass-Rate by (Task, Arm)");
lines.push("");
lines.push(`| Task | ${ARMS.join(" | ")} |`);
lines.push(`|------|${ARMS.map(() => "------").join("|")}|`);
for (const task of FEATURE_TASKS) {
  const cells = ARMS.map(arm => {
    const { pass, total } = passRate[task][arm];
    return total ? `${pass}/${total}` : "—";
  });
  lines.push(`| ${task} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## Mean Cost (USD) by (Task, Arm)");
lines.push("");
lines.push(`| Task | ${ARMS.join(" | ")} |`);
lines.push(`|------|${ARMS.map(() => "------").join("|")}|`);
for (const task of FEATURE_TASKS) {
  const cells = ARMS.map(arm => costMean[task][arm]);
  lines.push(`| ${task} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## Pairwise Judge: Baseline Win-Rate vs Feature");
lines.push("(>55% = baseline clearly better; 45-55% = tied; <45% = feature better)");
lines.push("");
lines.push(`| Task | caveman | rtk | cavecrew | all |`);
lines.push(`|------|---------|-----|----------|-----|`);
for (const task of FEATURE_TASKS) {
  const cells = ["caveman","rtk","cavecrew","all"].map(feat => {
    const j = judgeWin[task]?.[feat];
    if (!j || j.total === 0) return "—";
    return `${(j.baselineWins/j.total*100).toFixed(0)}% (${j.baselineWins}/${j.total})`;
  });
  lines.push(`| ${task} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## RTK Probe Recall");
lines.push("(fraction of seeded docs issues found by agent)");
lines.push("");
lines.push("| Arm | Recall |");
lines.push("|-----|--------|");
for (const arm of ["baseline","rtk","all"]) {
  lines.push(`| ${arm} | ${probeRecall[arm]} |`);
}
lines.push("");
lines.push("## Verdict per Feature");
lines.push("");
lines.push("| Feature | Verdict |");
lines.push("|---------|---------|");
for (const feat of ["caveman","rtk","cavecrew","all"]) {
  lines.push(`| ${feat} | ${verdict(feat)} |`);
}
lines.push("");
lines.push("---");
lines.push("*NEUTRAL = pass-rate within 1 cell of baseline AND judge win-rate ≤55% for baseline.*");
lines.push("*HURTS = pass-rate drops >1 cell in ≥2 tasks OR baseline wins >55% of judge duels.*");

process.stdout.write(lines.join("\n") + "\n");
