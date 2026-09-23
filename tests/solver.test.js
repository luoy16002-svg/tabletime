import { test } from "node:test";
import assert from "node:assert/strict";
import loadHighs from "highs";
import { solve } from "../core/solver.js";
import { validateProblem, checkSchedule } from "../core/model.js";
import { dinnerProblem, repairProblem } from "../core/recipes.js";
const highs = await loadHighs();
const task = (id, duration, resources, after = []) => ({
  id,
  title: id,
  modes: [{ id: "m", duration, resources }],
  after,
});
const problem = (tasks) => ({
  tasks,
  resources: { hands: 1, hob: 2 },
  now: 0,
  due: 0,
  horizon: 30,
});

test("parallel hobs still share one pair of hands", () => {
  const p = problem([
    task("a", 3, ["hands", "hob"]),
    task("b", 4, ["hands", "hob"]),
    task("c", 5, ["hob"], ["a"]),
  ]);
  const r = solve(highs, p);
  assert.equal(r.finish, 8);
  assert.equal(r.optimal, true);
  assert.equal(r.checked.valid, true);
});
test("explicit unavailable period is never occupied", () => {
  const p = problem([task("a", 5, ["hands"])]);
  p.blackouts = [{ resource: "hands", start: 2, end: 6 }];
  const r = solve(highs, p);
  assert.equal(r.steps[0].start, 6);
  assert.equal(r.finish, 11);
});
test("an impossible freshness requirement is reported, not silently ignored", () => {
  const p = problem([
    task("a", 5, ["hands"]),
    { ...task("b", 5, ["hands"]), maxHold: 0 },
  ]);
  p.tasks[0].maxHold = 0;
  assert.equal(solve(highs, p).status, "infeasible");
});
test("unavailable mode falls back to a legal alternative", () => {
  const p = problem([
    {
      ...task("a", 5, ["hands"]),
      modes: [
        { id: "unavailable", duration: 1, resources: ["hob"] },
        { id: "available", duration: 5, resources: ["hands"] },
      ],
    },
  ]);
  p.resources.hob = 0;
  const r = solve(highs, p);
  assert.equal(r.finish, 5);
  assert.equal(r.steps[0].mode, "available");
});
test("completed history cannot move and actual duration replaces the estimate", () => {
  const p = problem([task("a", 5, ["hands"]), task("b", 4, ["hands"], ["a"])]);
  p.now = 8;
  p.tasks[0].fixed = { start: 1, duration: 7, mode: "m", lanes: ["hands:0"] };
  const r = solve(highs, p);
  assert.equal(r.steps[0].start, 1);
  assert.equal(r.steps[0].end, 8);
  assert.equal(r.steps[1].start, 8);
});
test("cycles, invalid capacity, forged appliance assignments and duplicate IDs fail before solving", () => {
  assert.throws(
    () =>
      validateProblem(
        problem([
          task("a", 1, ["hands"], ["b"]),
          task("b", 1, ["hands"], ["a"]),
        ]),
      ),
    /circular/,
  );
  assert.throws(
    () =>
      validateProblem({
        ...problem([task("a", 1, ["hands"])]),
        resources: { hands: 99 },
      }),
    /capacity/,
  );
  assert.throws(
    () =>
      validateProblem(
        problem([task("a", 1, ["hands"]), task("a", 1, ["hands"])]),
      ),
    /unique/,
  );
  assert.throws(
    () =>
      validateProblem(
        problem([
          {
            ...task("a", 1, ["hands"]),
            fixed: { start: 0, duration: 1, mode: "m", lanes: ["hands:20"] },
          },
        ]),
      ),
    /appliance/,
  );
});
test("independent checker rejects overlap, waiting, cold food and moved fixed steps", () => {
  const p = problem([
    task("a", 3, ["hands"]),
    { ...task("b", 2, ["hands"], ["a"]), maxLag: { a: 0 }, maxHold: 2 },
  ]);
  const r = solve(highs, p);
  assert.equal(checkSchedule(p, r).valid, true);
  const overlap = structuredClone(r);
  overlap.steps[1].start = 1;
  overlap.steps[1].end = 3;
  assert.equal(checkSchedule(p, overlap).valid, false);
  const wait = structuredClone(r);
  wait.steps[1].start += 1;
  wait.steps[1].end += 1;
  wait.finish += 1;
  assert.equal(checkSchedule(p, wait).valid, false);
  assert.equal(checkSchedule(p, { ...r, finish: r.finish + 3 }).valid, false);
});
test("the four-dish menu passes every independent constraint", () => {
  const p = dinnerProblem(),
    r = solve(highs, p);
  assert.equal(r.status, "feasible");
  assert.equal(r.finish, 60);
  assert.equal(r.checked.valid, true);
  const noOven = repairProblem(p, r, { ovenOff: true });
  const twoCooks = structuredClone(noOven);
  twoCooks.resources.hands = 2;
  const repaired = solve(highs, twoCooks, { previous: r });
  assert.equal(repaired.status, "feasible");
  assert.equal(repaired.checked.valid, true);
  assert.equal(
    repaired.steps.some((t) => t.lanes.some((l) => l.startsWith("oven:"))),
    false,
  );
});

// Independent exhaustive oracle. No LP generation, solver helpers, interval validator or greedy reuse.
function bruteForce(p) {
  let best = p.horizon + 1;
  const assigned = [];
  function dfs(i) {
    if (i === p.tasks.length) {
      best = Math.min(best, Math.max(0, ...assigned.map((x) => x.end)));
      return;
    }
    const t = p.tasks[i],
      earliest = Math.max(
        0,
        ...t.after.map((d) => assigned.find((a) => a.id === d).end),
      );
    for (const m of t.modes) {
      const combos = m.resources.reduce(
        (acc, r) =>
          acc.flatMap((a) =>
            Array.from({ length: p.resources[r] }, (_, j) => [
              ...a,
              r + ":" + j,
            ]),
          ),
        [[]],
      );
      for (const lanes of combos)
        for (
          let start = earliest;
          start + m.duration < best && start + m.duration <= p.horizon;
          start++
        ) {
          const end = start + m.duration;
          if (
            assigned.some(
              (a) =>
                lanes.some((l) => a.lanes.includes(l)) &&
                start < a.end &&
                end > a.start,
            )
          )
            continue;
          assigned.push({ id: t.id, start, end, lanes });
          dfs(i + 1);
          assigned.pop();
        }
    }
  }
  dfs(0);
  return best;
}
test("MILP matches an exhaustive oracle on 36 small mixed-mode problems", () => {
  for (let seed = 1; seed <= 36; seed++) {
    let state = seed;
    const random = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const p = problem(
      Array.from({ length: 4 }, (_, i) =>
        task(
          "t" + i,
          1 + Math.floor(random() * 3),
          [random() < 0.5 ? "hands" : "hob"],
          i > 0 && random() < 0.5 ? ["t" + (i - 1)] : [],
        ),
      ),
    );
    p.horizon = 14;
    p.tasks[1].modes.push({
      id: "alternative",
      duration: 1 + Math.floor(random() * 3),
      resources: ["hands", "hob"],
    });
    const r = solve(highs, p, { seconds: 1 });
    assert.equal(r.optimal, true, `seed ${seed}`);
    assert.equal(r.finish, bruteForce(p), `seed ${seed}`);
  }
});
