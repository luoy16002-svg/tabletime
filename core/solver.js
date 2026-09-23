import {
  validateProblem,
  variants,
  checkSchedule,
  lowerBound,
} from "./model.js";

// Linear expressions are built from internal indices only, never user text.
const expr = (terms) =>
  terms
    .filter(([c]) => c !== 0)
    .map(([c, v], i) => `${c < 0 ? "-" : i ? "+" : ""} ${Math.abs(c)} ${v}`)
    .join(" ") || "0 C";
const s = (i) => `s${i}`,
  y = (i, m) => `y${i}_${m}`;

export function buildModel(problem, { finish, previous } = {}) {
  const p = validateProblem(problem),
    n = p.tasks.length,
    vs = p.tasks.map((t) => variants(t, p.resources));
  if (vs.some((v) => v.length === 0))
    return { p, vs, reason: "A step has no available cooking method." };
  const rows = [],
    bounds = [`0 <= C <= ${p.horizon}`],
    bins = [],
    generals = ["C"],
    idx = new Map(p.tasks.map((t, i) => [t.id, i]));
  const dur = (i) => vs[i].map((v, m) => [v.duration, y(i, m)]),
    end = (i) => [[1, s(i)], ...dur(i)],
    M = p.horizon + 120;
  const add = (terms, op, rhs) =>
    rows.push(`r${rows.length}: ${expr(terms)} ${op} ${rhs}`);
  add([[1, "C"]], ">=", p.due);
  if (finish != null) add([[1, "C"]], "=", finish);
  p.tasks.forEach((t, i) => {
    const lo = t.fixed ? t.fixed.start : Math.max(t.release, p.now),
      hi = t.fixed ? t.fixed.start : p.horizon;
    bounds.push(`${lo} <= ${s(i)} <= ${hi}`);
    generals.push(s(i));
    const selections = vs[i].map((_, m) => {
      const v = y(i, m);
      bins.push(v);
      return [1, v];
    });
    add(selections, "=", 1);
    add([[1, "C"], ...end(i).map(([c, v]) => [-c, v])], ">=", 0);
    if (t.maxHold != null)
      add([[1, "C"], ...end(i).map(([c, v]) => [-c, v])], "<=", t.maxHold);
    for (const dep of t.after)
      add([[1, s(i)], ...end(idx.get(dep)).map(([c, v]) => [-c, v])], ">=", 0);
    for (const [dep, lag] of Object.entries(t.maxLag))
      add(
        [[1, s(i)], ...end(idx.get(dep)).map(([c, v]) => [-c, v])],
        "<=",
        lag,
      );
    for (let m = 0; m < vs[i].length; m++)
      for (let b = 0; b < p.blackouts.length; b++) {
        const outage = p.blackouts[b];
        if (!vs[i][m].lanes.some((l) => l.split(":")[0] === outage.resource))
          continue;
        const z = `b${i}_${m}_${b}`;
        bins.push(z);
        // Selected method must finish before the outage or begin after it.
        add([...end(i), [-M, z], [M, y(i, m)]], "<=", outage.start + M);
        add(
          [
            [1, s(i)],
            [-M, z],
            [-M, y(i, m)],
          ],
          ">=",
          outage.end - 2 * M,
        );
      }
  });
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let ordering = false;
      for (let a = 0; a < vs[i].length; a++)
        for (let b = 0; b < vs[j].length; b++) {
          const pi = p.tasks[i].pot,
            pj = p.tasks[j].pot;
          if (
            pi &&
            pj &&
            pi.id === pj.id &&
            vs[i][a].lanes.find((l) => l.startsWith(pi.resource + ":")) !==
              vs[j][b].lanes.find((l) => l.startsWith(pj.resource + ":"))
          )
            add(
              [
                [1, y(i, a)],
                [1, y(j, b)],
              ],
              "<=",
              1,
            );
          if (!vs[i][a].lanes.some((l) => vs[j][b].lanes.includes(l))) continue;
          const z = `o${i}_${j}`;
          if (!ordering) {
            bins.push(z);
            ordering = true;
          }
          add(
            [
              [1, s(j)],
              [-1, s(i)],
              ...dur(i).map(([c, v]) => [-c, v]),
              [-M, z],
              [-M, y(i, a)],
              [-M, y(j, b)],
            ],
            ">=",
            -3 * M,
          );
          add(
            [
              [1, s(i)],
              [-1, s(j)],
              ...dur(j).map(([c, v]) => [-c, v]),
              [M, z],
              [-M, y(i, a)],
              [-M, y(j, b)],
            ],
            ">=",
            -2 * M,
          );
        }
    }
  let objective = [[1, "C"]];
  if (finish != null) {
    objective = [];
    p.tasks.forEach((t, i) => {
      objective.push([-1, s(i)]);
      if (t.maxHold != null)
        objective.push(...end(i).map(([c, v]) => [-5 * c, v]));
      const old = previous?.steps.find((q) => q.id === t.id);
      if (old && !t.fixed) {
        const d = `d${i}`;
        bounds.push(`0 <= ${d} <= ${p.horizon}`);
        objective.push([50, d]);
        add(
          [
            [1, d],
            [-1, s(i)],
          ],
          ">=",
          -old.start,
        );
        add(
          [
            [1, d],
            [1, s(i)],
          ],
          ">=",
          old.start,
        );
        vs[i].forEach((v, m) => {
          if (v.id !== old.mode) objective.push([20, y(i, m)]);
        });
      }
    });
  }
  return {
    p,
    vs,
    lp: `Minimize\n obj: ${expr(objective)}\nSubject To\n ${rows.join("\n ")}\nBounds\n ${bounds.join("\n ")}\nGenerals\n ${generals.join(" ")}\nBinaries\n ${bins.join(" ")}\nEnd`,
    variables: n + bins.length + 1,
    constraints: rows.length,
  };
}

function extract(result, model) {
  if (!result.Columns?.C || !Number.isFinite(result.Columns.C.Primal))
    return null;
  const steps = model.p.tasks.map((t, i) => {
    const m = model.vs[i].findIndex(
      (_, j) => (result.Columns[y(i, j)]?.Primal ?? 0) > 0.5,
    );
    if (m < 0) return null;
    const mode = model.vs[i][m],
      start = Math.round(result.Columns[s(i)]?.Primal);
    return {
      id: t.id,
      title: t.title,
      recipe: t.recipe,
      mode: mode.id,
      start,
      end: start + mode.duration,
      lanes: mode.lanes,
    };
  });
  if (steps.some((x) => !x)) return null;
  const answer = { finish: Math.round(result.Columns.C.Primal), steps };
  return checkSchedule(model.p, answer).valid ? answer : null;
}

/** Two-stage MILP: earliest feasible service; then freshness and minimal plan disruption. */
export function solve(highs, input, { seconds = 3, previous = null } = {}) {
  const started = performance.now(),
    model = buildModel(input);
  if (model.reason)
    return {
      status: "infeasible",
      reason: model.reason,
      elapsedMs: performance.now() - started,
    };
  const opts = {
    output_flag: false,
    time_limit: seconds,
    mip_rel_gap: 0,
    random_seed: 17,
    threads: 1,
  };
  const r = highs.solve(model.lp, opts),
    first = extract(r, model);
  if (!first)
    return {
      status: r.Status === "Infeasible" ? "infeasible" : "timeout",
      reason:
        r.Status === "Infeasible"
          ? "The available time, appliances and serving windows cannot all be satisfied."
          : "No verified schedule was found within the time limit.",
      solverStatus: r.Status,
      elapsedMs: performance.now() - started,
    };
  const polished = buildModel(input, { finish: first.finish, previous });
  const r2 = highs.solve(polished.lp, opts),
    better = extract(r2, polished);
  const result = better ?? first;
  const bound = lowerBound(model.p);
  return {
    ...result,
    status: "feasible",
    optimal: r.Status === "Optimal",
    polished: r2.Status === "Optimal",
    solverStatus: r.Status,
    lowerBound: bound,
    elapsedMs: Math.round(performance.now() - started),
    variables: model.variables,
    constraints: model.constraints,
    lateness: Math.max(0, result.finish - model.p.due),
    checked: checkSchedule(model.p, result),
    changed: previous
      ? result.steps
          .filter((t) => {
            const old = previous.steps.find((o) => o.id === t.id);
            return old && (t.start !== old.start || t.mode !== old.mode);
          })
          .map((t) => ({
            id: t.id,
            title: t.title,
            from: previous.steps.find((o) => o.id === t.id).start,
            to: t.start,
            mode: t.mode,
          }))
      : [],
  };
}
