import { validateProblem, variants, checkSchedule } from "./model.js";
// A reproducible list-scheduling baseline: take the first ready recipe step and its earliest available method.
export function greedy(input, { priority = "recipe", ranks = null } = {}) {
  const p = validateProblem(input),
    steps = [],
    todo = [...p.tasks],
    byId = new Map();
  const occupied = new Map();
  while (todo.length) {
    const ready = todo.filter((t) => t.after.every((d) => byId.has(d)));
    if (!ready.length) return null;
    if (priority === "longest")
      ready.sort(
        (a, b) =>
          Math.max(...b.modes.map((m) => m.duration)) -
          Math.max(...a.modes.map((m) => m.duration)),
      );
    if (ranks) ready.sort((a, b) => ranks[a.id] - ranks[b.id]);
    const t = ready[0];
    let best = null;
    for (const m of variants(t, p.resources)) {
      const earliest = t.fixed
        ? t.fixed.start
        : Math.max(p.now, t.release, ...t.after.map((d) => byId.get(d).end));
      for (let start = earliest; start + m.duration <= p.horizon; start++) {
        if (t.fixed && start !== t.fixed.start) break;
        const end = start + m.duration;
        if (
          m.lanes.some((l) =>
            (occupied.get(l) ?? []).some((o) => start < o.end && end > o.start),
          )
        )
          continue;
        if (
          p.blackouts.some(
            (b) =>
              m.lanes.some((l) => l.startsWith(b.resource + ":")) &&
              start < b.end &&
              end > b.start,
          )
        )
          continue;
        const candidate = {
          id: t.id,
          title: t.title,
          recipe: t.recipe,
          mode: m.id,
          start,
          end,
          lanes: m.lanes,
        };
        if (!best || end < best.end) best = candidate;
        break;
      }
    }
    if (!best) return null;
    steps.push(best);
    byId.set(t.id, best);
    todo.splice(todo.indexOf(t), 1);
    best.lanes.forEach((l) =>
      occupied.set(l, [...(occupied.get(l) ?? []), best]),
    );
  }
  const result = { steps, finish: Math.max(p.due, ...steps.map((s) => s.end)) };
  return { ...result, checked: checkSchedule(p, result) };
}
