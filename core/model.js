/** Pure problem validation; no solver state and no environment-specific APIs. */
export function validateProblem(input) {
  const p = structuredClone(input);
  if (
    !p ||
    !Array.isArray(p.tasks) ||
    p.tasks.length < 1 ||
    p.tasks.length > 48
  )
    throw new Error("Choose 1–48 cooking steps.");
  const integer = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  p.now ??= 0;
  p.due ??= 0;
  p.horizon ??= 360;
  if (
    ![p.now, p.due].every((x) => integer(x, 0, 600)) ||
    !integer(p.horizon, 1, 720) ||
    p.now > p.horizon ||
    p.due > p.horizon
  )
    throw new Error(
      "Times must be whole minutes within the planning horizon (up to 12 hours).",
    );
  if (!p.resources || Object.keys(p.resources).length > 5)
    throw new Error("Define up to five kitchen resources.");
  for (const [r, c] of Object.entries(p.resources))
    if (!/^[a-z][a-z0-9_]{0,24}$/.test(r) || !integer(c, 0, 3))
      throw new Error("Resource capacity must be between 0 and 3.");
  const ids = new Set(p.tasks.map((t) => t.id));
  if (ids.size !== p.tasks.length) throw new Error("Step IDs must be unique.");
  for (const t of p.tasks) {
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(t.id) ||
      typeof t.title !== "string" ||
      t.title.length > 160
    )
      throw new Error("Each step needs a short ID and title.");
    t.after ??= [];
    t.release ??= p.now;
    if (
      !Array.isArray(t.after) ||
      t.after.some((x) => !ids.has(x) || x === t.id)
    )
      throw new Error("Every dependency must refer to another step.");
    if (!integer(t.release, 0, p.horizon))
      throw new Error("Invalid release time.");
    if (t.maxHold != null && !integer(t.maxHold, 0, 240))
      throw new Error("Invalid serving window.");
    t.maxLag ??= {};
    if (
      Object.entries(t.maxLag).some(
        ([d, v]) => !t.after.includes(d) || !integer(v, 0, 240),
      )
    )
      throw new Error("Invalid waiting constraint.");
    if (
      t.pot &&
      (typeof t.pot.id !== "string" || !(t.pot.resource in p.resources))
    )
      throw new Error("Invalid shared cookware.");
    if (!Array.isArray(t.modes) || !t.modes.length || t.modes.length > 3)
      throw new Error("Each step needs 1–3 cooking methods.");
    if (new Set(t.modes.map((m) => m.id)).size !== t.modes.length)
      throw new Error("Method IDs must be unique within a step.");
    for (const m of t.modes) {
      if (
        typeof m.id !== "string" ||
        !integer(m.duration, 1, 120) ||
        !Array.isArray(m.resources) ||
        new Set(m.resources).size !== m.resources.length ||
        m.resources.some((r) => !(r in p.resources))
      )
        throw new Error("Invalid cooking method or resource.");
    }
    if (t.fixed) {
      const f = t.fixed;
      if (
        !integer(f.start, 0, p.horizon) ||
        !integer(f.duration, 1, 120) ||
        !t.modes.some((m) => m.id === f.mode) ||
        !Array.isArray(f.lanes)
      )
        throw new Error("Invalid recorded progress.");
      const m = t.modes.find((m) => m.id === f.mode);
      if (
        f.lanes.length !== m.resources.length ||
        new Set(f.lanes).size !== f.lanes.length ||
        m.resources.some(
          (r) => f.lanes.filter((l) => l.startsWith(r + ":")).length !== 1,
        ) ||
        f.lanes.some((l) => {
          const [r, i] = l.split(":");
          return (
            !/^\d+$/.test(i) ||
            !(r in p.resources) ||
            Number(i) >= p.resources[r]
          );
        })
      )
        throw new Error("Invalid recorded appliance assignment.");
      // Completed and started steps are observations, never rescheduled assumptions.
      t.release = f.start;
    }
  }
  const visiting = new Set(),
    seen = new Set(),
    byId = new Map(p.tasks.map((t) => [t.id, t]));
  function visit(id) {
    if (visiting.has(id))
      throw new Error("Cooking steps contain a circular dependency.");
    if (seen.has(id)) return;
    visiting.add(id);
    byId.get(id).after.forEach(visit);
    visiting.delete(id);
    seen.add(id);
  }
  p.tasks.forEach((t) => visit(t.id));
  p.blackouts ??= [];
  if (!Array.isArray(p.blackouts) || p.blackouts.length > 12)
    throw new Error("Too many unavailable periods.");
  for (const b of p.blackouts)
    if (
      !(b.resource in p.resources) ||
      !integer(b.start, 0, p.horizon) ||
      !integer(b.end, b.start + 1, p.horizon)
    )
      throw new Error("Invalid unavailable period.");
  return p;
}

export function variants(task, resources) {
  if (task.fixed)
    return [
      {
        id: task.fixed.mode,
        duration: task.fixed.duration,
        lanes: [...task.fixed.lanes],
      },
    ];
  const out = [];
  for (const m of task.modes) {
    let combos = [[]];
    for (const r of m.resources)
      combos = combos.flatMap((c) =>
        Array.from({ length: resources[r] }, (_, i) => [...c, `${r}:${i}`]),
      );
    for (const lanes of combos) out.push({ ...m, lanes });
  }
  return out;
}

/** Independent interval-sweep validator. It does not reuse MILP rows. */
export function checkSchedule(problem, schedule) {
  const errors = [],
    p = validateProblem(problem),
    rows = schedule?.steps ?? [],
    map = new Map(rows.map((s) => [s.id, s]));
  if (rows.length !== p.tasks.length || map.size !== p.tasks.length)
    errors.push("Missing or duplicate steps");
  const finish = schedule?.finish;
  if (!Number.isInteger(finish) || finish < p.due || finish > p.horizon)
    errors.push("Invalid finish time");
  const occupancy = new Map();
  for (const t of p.tasks) {
    const s = map.get(t.id);
    if (!s) continue;
    if (
      !Number.isInteger(s.start) ||
      !Number.isInteger(s.end) ||
      s.end <= s.start ||
      s.start < t.release ||
      s.end > finish ||
      (!t.fixed && s.start < p.now)
    )
      errors.push(`${t.id}: invalid time`);
    const choices = variants(t, p.resources);
    const chosen = choices.find(
      (m) =>
        m.id === s.mode &&
        m.duration === s.end - s.start &&
        JSON.stringify([...m.lanes].sort()) ===
          JSON.stringify([...(s.lanes ?? [])].sort()),
    );
    if (!chosen) errors.push(`${t.id}: invalid method or resource assignment`);
    if (
      t.fixed &&
      (s.start !== t.fixed.start || s.end !== t.fixed.start + t.fixed.duration)
    )
      errors.push(`${t.id}: recorded progress moved`);
    for (const dep of t.after)
      if (!map.has(dep) || map.get(dep).end > s.start)
        errors.push(`${t.id}: dependency ${dep} not finished`);
    for (const [dep, lag] of Object.entries(t.maxLag))
      if (map.has(dep) && s.start - map.get(dep).end > lag)
        errors.push(`${t.id}: waited too long after ${dep}`);
    if (t.maxHold != null && finish - s.end > t.maxHold)
      errors.push(`${t.id}: serving window exceeded`);
    for (const lane of s.lanes ?? []) {
      const list = occupancy.get(lane) ?? [];
      list.push(s);
      occupancy.set(lane, list);
      for (const b of p.blackouts)
        if (
          lane.split(":")[0] === b.resource &&
          s.start < b.end &&
          s.end > b.start
        )
          errors.push(`${t.id}: uses unavailable ${b.resource}`);
    }
  }
  const pots = new Map();
  for (const t of p.tasks)
    if (t.pot && map.has(t.id)) {
      const lane = map
        .get(t.id)
        .lanes.find((l) => l.startsWith(t.pot.resource + ":"));
      const old = pots.get(t.pot.id);
      if (old && old !== lane) errors.push(`${t.id}: cookware changed burner`);
      pots.set(t.pot.id, lane);
    }
  for (const [lane, list] of occupancy) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++)
      if (list[i].start < list[i - 1].end)
        errors.push(`${lane}: overlapping ${list[i - 1].id} and ${list[i].id}`);
  }
  return { valid: errors.length === 0, errors };
}

export function lowerBound(p) {
  const end = new Map(),
    byId = new Map(p.tasks.map((t) => [t.id, t]));
  const path = (id) => {
    if (end.has(id)) return end.get(id);
    const t = byId.get(id);
    const value = t.fixed
      ? t.fixed.start + t.fixed.duration
      : Math.max(p.now, t.release, ...t.after.map(path)) +
        Math.min(...t.modes.map((m) => m.duration));
    end.set(id, value);
    return value;
  };
  let lb = Math.max(p.due, ...p.tasks.map((t) => path(t.id)));
  for (const [r, c] of Object.entries(p.resources))
    if (c) {
      const work = p.tasks.reduce(
        (n, t) =>
          n +
          (t.fixed
            ? t.fixed.lanes.some((l) => l.startsWith(r + ":"))
              ? t.fixed.duration
              : 0
            : Math.min(
                ...t.modes.map((m) =>
                  m.resources.includes(r) ? m.duration : 0,
                ),
              )),
        0,
      );
      lb = Math.max(lb, Math.ceil(work / c));
    }
  return lb;
}
