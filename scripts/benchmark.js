import fs from "node:fs";
import os from "node:os";
import loadHighs from "highs";
import { solve } from "../core/solver.js";
import { checkSchedule } from "../core/model.js";
import { greedy } from "../core/greedy.js";
import { dinnerProblem } from "../core/recipes.js";

const highs = await loadHighs();
function rng(seed) {
  let x = seed;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
const rows = [];
// Published, fixed-seed synthetic RCPSP instances. These are algorithm tests, not observed kitchen trials.
for (let seed = 1; seed <= 60; seed++) {
  const rand = rng(seed * 7919),
    n = 9 + (seed % 10);
  const p = {
    resources: { hands: 1, hob: 1 + (seed % 2), oven: 1 },
    now: 0,
    due: 0,
    horizon: 240,
    tasks: [],
  };
  for (let i = 0; i < n; i++) {
    const resources =
      rand() < 0.5 ? ["hands"] : rand() < 0.5 ? ["hob"] : ["oven"];
    if (rand() < 0.25 && !resources.includes("hands")) resources.push("hands");
    const modes = [
      { id: "main", duration: 2 + Math.floor(rand() * 13), resources },
    ];
    if (i % 4 === 0)
      modes.push({
        id: "alternate",
        duration: 4 + Math.floor(rand() * 13),
        resources: ["hands", "hob"],
      });
    const after = [];
    for (let j = 0; j < i; j++) if (rand() < 0.1) after.push("t" + j);
    p.tasks.push({ id: "t" + i, title: "Synthetic step " + i, modes, after });
  }
  const fifo = greedy(p),
    longest = greedy(p, { priority: "longest" });
  let multi = longest;
  for (let attempt = 0; attempt < 64; attempt++) {
    const ranks = Object.fromEntries(p.tasks.map((t) => [t.id, rand()]));
    const g = greedy(p, { ranks });
    if (g && (!multi || g.finish < multi.finish)) multi = g;
  }
  const r = solve(highs, p, { seconds: 1 });
  if (r.status !== "feasible" || !checkSchedule(p, r).valid)
    throw new Error(`Unverified output in seed ${seed}: ${r.status}`);
  rows.push({
    seed,
    tasks: n,
    optimized: r.finish,
    fifo: fifo.finish,
    longest: longest.finish,
    multistart64: multi.finish,
    optimal: r.optimal,
    milliseconds: r.elapsedMs,
    valid: true,
  });
  if (seed % 10 === 0) console.log(`${seed}/60 benchmark cases verified`);
}
const mean = (k) => rows.reduce((n, r) => n + r[k], 0) / rows.length;
const timings = rows.map((r) => r.milliseconds).sort((a, b) => a - b);
const kitchen = [];
for (const cooks of [1, 2])
  for (const hobs of [1, 2])
    for (const oven of [0, 1]) {
      const p = dinnerProblem(undefined, {
        resources: { hands: cooks, hob: hobs, oven },
        due: 60,
      });
      const r = solve(highs, p, { seconds: 2 });
      kitchen.push({
        cooks,
        hobs,
        oven,
        status: r.status,
        finish: r.finish ?? null,
        valid: r.status === "feasible" ? checkSchedule(p, r).valid : null,
        milliseconds: r.elapsedMs,
      });
    }
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  cpu: os.cpus()[0].model,
  solver: "highs 1.15.3",
  scope:
    "60 synthetic scheduling cases; 8 illustrative kitchen configurations. Not real-world cooking trials.",
  limits: { secondsPerOptimizationStage: 1, baselineRandomPriorities: 64 },
  summary: {
    cases: rows.length,
    independentlyValid: rows.filter((r) => r.valid).length,
    provenOptimal: rows.filter((r) => r.optimal).length,
    meanFinishOptimized: mean("optimized"),
    meanFinishFifo: mean("fifo"),
    meanFinishLongest: mean("longest"),
    meanFinishMultistart64: mean("multistart64"),
    improvementVsFifoPercent:
      (100 * (mean("fifo") - mean("optimized"))) / mean("fifo"),
    improvementVsMultistart64Percent:
      (100 * (mean("multistart64") - mean("optimized"))) / mean("multistart64"),
    medianMilliseconds: timings[Math.floor(timings.length / 2)],
    p95Milliseconds: timings[Math.floor(timings.length * 0.95)],
  },
  kitchen,
  rows,
};
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/benchmark.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
