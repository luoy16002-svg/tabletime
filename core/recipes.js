// Original demonstration recipes, four portions. Durations are estimates, not measured cooking outcomes.
const mode = (id, duration, resources) => ({ id, duration, resources });
const step = (id, title, modes, after = [], extra = {}) => ({
  id,
  title,
  modes,
  after,
  ...extra,
});
export const recipes = [
  {
    id: "lentils",
    title: "Smoky tomato lentils",
    subtitle: "Comforting, one pot, a little paprika.",
    color: "#b96b49",
    ingredients: [
      "2 cans cooked lentils, drained",
      "1 can chopped tomatoes",
      "1 onion, chopped",
      "Olive oil, smoked paprika, salt",
    ],
    steps: [
      step("lentils_prep", "Chop the onion", [mode("board", 5, ["hands"])]),
      step(
        "lentils_saute",
        "Soften onion with paprika",
        [mode("hob", 6, ["hands", "hob"])],
        ["lentils_prep"],
        { pot: { id: "lentil_pot", resource: "hob" } },
      ),
      step(
        "lentils_add",
        "Add cooked lentils and tomatoes",
        [mode("hob", 2, ["hands", "hob"])],
        ["lentils_saute"],
        {
          maxLag: { lentils_saute: 0 },
          pot: { id: "lentil_pot", resource: "hob" },
        },
      ),
      step(
        "lentils_simmer",
        "Simmer the lentils",
        [mode("hob", 18, ["hob"])],
        ["lentils_add"],
        {
          maxLag: { lentils_add: 0 },
          maxHold: 15,
          pot: { id: "lentil_pot", resource: "hob" },
        },
      ),
      step(
        "lentils_finish",
        "Season lentils and transfer to a bowl",
        [mode("finish", 2, ["hands", "hob"])],
        ["lentils_simmer"],
        {
          maxLag: { lentils_simmer: 0 },
          maxHold: 15,
          pot: { id: "lentil_pot", resource: "hob" },
        },
      ),
    ],
  },
  {
    id: "courgettes",
    title: "Lemon courgettes",
    subtitle: "Roast in the oven or sauté in a pan.",
    color: "#6a7951",
    ingredients: ["3 courgettes, sliced", "1 lemon", "Olive oil, salt, pepper"],
    steps: [
      step("courgettes_prep", "Slice and season courgettes", [
        mode("board", 5, ["hands"]),
      ]),
      step(
        "courgettes_cook",
        "Cook courgettes",
        [mode("roast", 18, ["oven"]), mode("pan", 12, ["hob", "hands"])],
        ["courgettes_prep"],
        { maxHold: 15 },
      ),
      step(
        "courgettes_finish",
        "Finish with lemon",
        [mode("finish", 2, ["hands"])],
        ["courgettes_cook"],
        { maxHold: 10 },
      ),
    ],
  },
  {
    id: "couscous",
    title: "Herby couscous",
    subtitle: "Fluffy grains, fresh herbs, lemon.",
    color: "#bc993e",
    ingredients: [
      "250 g instant couscous",
      "300 ml water (check pack)",
      "A handful of parsley",
      "Olive oil, salt",
    ],
    steps: [
      step(
        "couscous_prep",
        "Measure couscous and fill saucepan",
        [mode("board", 2, ["hands", "hob"])],
        [],
        { pot: { id: "water_pan", resource: "hob" } },
      ),
      step(
        "couscous_boil",
        "Bring water to a boil",
        [mode("hob", 5, ["hob"])],
        ["couscous_prep"],
        {
          maxLag: { couscous_prep: 0 },
          pot: { id: "water_pan", resource: "hob" },
        },
      ),
      step(
        "couscous_pour",
        "Pour water over couscous and cover",
        [mode("pour", 1, ["hands", "hob"])],
        ["couscous_boil"],
        {
          maxLag: { couscous_boil: 0 },
          pot: { id: "water_pan", resource: "hob" },
        },
      ),
      step(
        "couscous_rest",
        "Leave couscous to absorb",
        [mode("rest", 7, [])],
        ["couscous_pour"],
        { maxLag: { couscous_pour: 0 }, maxHold: 10 },
      ),
      step(
        "couscous_finish",
        "Fluff and fold in herbs",
        [mode("finish", 2, ["hands"])],
        ["couscous_rest"],
        { maxHold: 10 },
      ),
    ],
  },
  {
    id: "flatbreads",
    title: "Warm flatbreads",
    subtitle: "Simple dough; serve straight from the heat.",
    color: "#8a6c53",
    ingredients: [
      "200 g self-raising flour",
      "180 g plain yoghurt",
      "A pinch of salt",
    ],
    steps: [
      step("flatbreads_mix", "Mix flour, yoghurt and salt", [
        mode("board", 4, ["hands"]),
      ]),
      step(
        "flatbreads_rest",
        "Rest the dough",
        [mode("rest", 10, [])],
        ["flatbreads_mix"],
        { maxLag: { flatbreads_mix: 0 } },
      ),
      step(
        "flatbreads_shape",
        "Divide and roll four flatbreads",
        [mode("board", 4, ["hands"])],
        ["flatbreads_rest"],
      ),
      step(
        "flatbreads_cook",
        "Cook flatbreads",
        [mode("oven", 6, ["oven"]), mode("pan", 8, ["hands", "hob"])],
        ["flatbreads_shape"],
        { maxHold: 4 },
      ),
      step(
        "flatbreads_finish",
        "Bring warm flatbreads to the table",
        [mode("finish", 1, ["hands"])],
        ["flatbreads_cook"],
        { maxHold: 4 },
      ),
    ],
  },
];

export function dinnerProblem(ids = recipes.map((r) => r.id), options = {}) {
  if (
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !recipes.some((r) => r.id === id))
  )
    throw new Error("Choose recipes from the current menu.");
  const resources = { hands: 1, hob: 2, oven: 1, ...options.resources };
  const tasks = recipes
    .filter((r) => ids.includes(r.id))
    .flatMap((r) =>
      r.steps.map((s) => ({ ...structuredClone(s), recipe: r.id })),
    );
  // Explicit preheating consumes the oven; every oven method requires this shared step.
  // Both oven dishes use 200 °C, one tray at a time. The hob alternatives need no preheat.
  if (
    resources.oven > 0 &&
    ids.some((id) => ["courgettes", "flatbreads"].includes(id))
  ) {
    tasks.unshift(
      step("oven_preheat", "Preheat the oven to 200°C", [
        mode("oven", 10, ["oven"]),
      ]),
    );
    // Requiring preheat for hob alternatives is conservative. We remove it when the oven is unavailable.
    for (const t of tasks)
      if (
        t.id !== "oven_preheat" &&
        t.modes.some((m) => m.resources.includes("oven"))
      )
        t.after.push("oven_preheat");
  }
  return {
    tasks,
    resources,
    now: 0,
    due: 60,
    horizon: 240,
    blackouts: [],
    ...options,
  };
}

export function repairProblem(
  problem,
  schedule,
  { now = problem.now, delay = null, ovenOff = false, hands = null } = {},
) {
  if (!schedule?.steps) throw new Error("Confirm a dinner plan first.");
  const p = structuredClone(problem);
  p.now = now;
  if (!Number.isInteger(now) || now < problem.now || now > p.horizon)
    throw new Error("Time cannot move backwards.");
  // The demo advances a simulated kitchen. In real use pass only progress confirmed by the cook.
  for (const t of p.tasks) {
    const old = schedule.steps.find((s) => s.id === t.id);
    if (old && old.start < now)
      t.fixed = {
        start: old.start,
        duration: old.end - old.start,
        mode: old.mode,
        lanes: [...old.lanes],
      };
  }
  if (delay) {
    const t = p.tasks.find((t) => t.id === delay.id);
    if (
      !t ||
      !Number.isInteger(delay.minutes) ||
      delay.minutes < 1 ||
      delay.minutes > 60
    )
      throw new Error("Choose a step and a delay of 1–60 minutes.");
    if (t.fixed) {
      if (t.fixed.start + t.fixed.duration <= now)
        throw new Error("That step is already finished in this simulation.");
      t.fixed.duration += delay.minutes;
    } else
      t.modes = t.modes.map((m) => ({
        ...m,
        duration: m.duration + delay.minutes,
      }));
  }
  if (hands != null) {
    if (!Number.isInteger(hands) || hands < 1 || hands > 3)
      throw new Error("Choose 1–3 cooks.");
    p.resources.hands = hands;
  }
  if (ovenOff) {
    if (
      p.tasks.some(
        (t) =>
          t.fixed &&
          t.fixed.start + t.fixed.duration > now &&
          t.fixed.lanes.some((l) => l.startsWith("oven:")),
      )
    )
      throw new Error(
        "The oven is in use. Confirm what happened to that dish before replanning.",
      );
    // Retain historical oven use, while preventing all future oven methods.
    const preheat = p.tasks.find((t) => t.id === "oven_preheat");
    if (preheat && !preheat.fixed)
      p.tasks = p.tasks.filter((t) => t.id !== "oven_preheat");
    for (const t of p.tasks) {
      if (!t.fixed)
        t.modes = t.modes.filter((m) => !m.resources.includes("oven"));
      if (!p.tasks.some((t) => t.id === "oven_preheat"))
        t.after = t.after.filter((id) => id !== "oven_preheat");
    }
    p.blackouts.push({ resource: "oven", start: now, end: p.horizon });
    if (p.tasks.some((t) => !t.modes.length))
      throw new Error(
        "A selected dish needs the oven. Choose a different dish before replanning.",
      );
  }
  return p;
}
