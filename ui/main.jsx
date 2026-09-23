import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock3,
  Flame,
  Hand,
  Leaf,
  Plus,
  Minus,
  Utensils,
  Users,
  ChevronDown,
  ChevronRight,
  Info,
  LoaderCircle,
  Unplug,
  TimerReset,
  CheckCircle2,
  X,
  Code2,
} from "lucide-react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/libre-caslon-display/400.css";
import { recipes } from "../core/recipes.js";
import { makeClient } from "./client.js";
import "./style.css";

const BASE = 18 * 60 + 30;
const time = (m) => {
  const v = (BASE + m) % (24 * 60);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const color = (id) => recipes.find((r) => r.id === id)?.color ?? "#7c8178";
const nameOf = (id) => recipes.find((r) => r.id === id)?.title ?? "Oven";

function App() {
  const [client, setClient] = useState(null),
    [menu, setMenu] = useState(recipes.map((r) => r.id)),
    [cooks, setCooks] = useState(1),
    [hobs, setHobs] = useState(2),
    [due, setDue] = useState(60);
  const [snapshot, setSnapshot] = useState({ revision: 0, active: null }),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState("Getting your kitchen ready…"),
    [error, setError] = useState(""),
    [failed, setFailed] = useState(null),
    [selected, setSelected] = useState(null),
    [view, setView] = useState("dishes"),
    [info, setInfo] = useState(false),
    [trace, setTrace] = useState([]),
    [notice, setNotice] = useState("");
  const shown = preview ?? snapshot.active,
    result = shown?.result,
    problem = shown?.problem,
    now = problem?.now ?? 0;
  async function call(name, args = {}, c = client) {
    const start = performance.now();
    const r = await c.call(name, args);
    setTrace((t) =>
      [{ name, ms: Math.round(performance.now() - start) }, ...t].slice(0, 8),
    );
    return r;
  }
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await makeClient();
        if (!mounted) return;
        setClient(c);
        const s = await call("read_dinner", {}, c);
        setSnapshot(s);
        if (s.active) {
          setMenu([
            ...new Set(
              s.active.problem.tasks.map((t) => t.recipe).filter(Boolean),
            ),
          ]);
          setCooks(s.active.problem.resources.hands);
          setHobs(s.active.problem.resources.hob);
          setDue(s.active.problem.due);
          setNotice("Your last dinner is right where you left it.");
        } else {
          const d = await call("draft_dinner", {}, c);
          setPreview(d.proposal ?? null);
          if (!d.proposal) setError(d.result.reason);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy("");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  async function run(label, fn) {
    if (busy) return;
    setBusy(label);
    setError("");
    setFailed(null);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  const draft = () =>
    run("Finding room for every step…", async () => {
      const r = await call("draft_dinner", {
        recipes: menu,
        readyIn: due,
        cooks,
        hobs,
      });
      setPreview(r.proposal ?? null);
      if (!r.proposal) setFailed(r);
      setSelected(null);
    });
  const accept = (p = preview) =>
    run("Saving your dinner…", async () => {
      await call("accept_dinner", {
        proposalId: p.id,
        expectedRevision: snapshot.revision,
        requestId: crypto.randomUUID(),
      });
      const s = await call("read_dinner");
      setSnapshot(s);
      setPreview(null);
      setFailed(null);
      setCooks(s.active.problem.resources.hands);
      setNotice("Plan saved. Everything has its place.");
    });
  const repair = (kind) =>
    run(
      kind === "oven"
        ? "Checking a way around the oven…"
        : "Adjusting the rest of dinner…",
      async () => {
        const active = snapshot.active;
        if (!active)
          throw new Error("Use this plan before trying a kitchen change.");
        const args = { expectedRevision: snapshot.revision };
        if (kind === "oven") args.ovenOff = true;
        if (kind === "help") args.cooks = 2;
        if (kind === "delay") {
          const simmer = active.result.steps.find(
            (t) => t.id === "lentils_simmer",
          );
          if (!simmer)
            throw new Error(
              "Add lentils to the saved dinner to try this change.",
            );
          args.now = Math.max(active.problem.now, simmer.start + 1);
          args.simulateProgress = true;
          args.delay = { id: simmer.id, minutes: 8 };
        }
        const r = await call("draft_repair", args);
        setPreview(r.proposal ?? null);
        if (!r.proposal) setFailed(r);
        setSelected(null);
      },
    );
  const toggle = (id) =>
    setMenu((m) =>
      m.includes(id)
        ? m.length > 1
          ? m.filter((x) => x !== id)
          : m
        : [...m, id],
    );
  const firstHands = result?.steps
    .filter((t) => t.lanes.some((l) => l.startsWith("hands:")) && t.end > now)
    .sort((a, b) => a.start - b.start)[0];
  const late = result ? Math.max(0, result.finish - (problem?.due ?? due)) : 0;
  return (
    <>
      <header className="top">
        <a className="brand" href="./">
          <span className="brand-symbol">
            <Utensils size={19} />
          </span>
          tabletime<span className="brand-dot">.</span>
        </a>
        <div className="top-right">
          <span className="connection">
            <i />
            {client?.mode ?? "Opening kitchen"}
          </span>
          <button className="text-button" onClick={() => setInfo(true)}>
            How it works <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">A LITTLE LESS JUGGLING</p>
            <h1>
              Dinner, <em>together.</em>
            </h1>
            <p className="intro-copy">
              Four dishes. One kitchen. A plan that makes room for real life.
            </p>
          </div>
          <div className="date-stamp">
            <span>THE EVENING MENU</span>
            <strong>For four, at home</strong>
            <span className="stamp-line">Vegetarian · Made from scratch</span>
          </div>
        </section>
        <div className="workspace">
          <aside className="sidebar">
            <div className="section-heading">
              <span className="small-number">01</span>
              <h2>What’s for dinner?</h2>
            </div>
            <p className="muted sidebar-sub">
              Start with a dish. Make it a table.
            </p>
            <div className="recipe-list">
              {recipes.map((r, i) => (
                <button
                  key={r.id}
                  className={`recipe ${menu.includes(r.id) ? "chosen" : ""}`}
                  onClick={() => toggle(r.id)}
                  aria-pressed={menu.includes(r.id)}
                >
                  <span className="recipe-swatch" style={{ "--dish": r.color }}>
                    <Leaf size={21} />
                  </span>
                  <span className="recipe-copy">
                    <strong>{r.title}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                  <span className="recipe-check">
                    {menu.includes(r.id) ? (
                      <Check size={13} />
                    ) : (
                      <Plus size={13} />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="kitchen-settings">
              <div className="setting">
                <label htmlFor="ready">At the table by</label>
                <div className="time-input">
                  <Clock3 size={16} />
                  <input
                    id="ready"
                    type="time"
                    value={time(due)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      const v = h * 60 + m - BASE;
                      if (v >= 0 && v <= 240) setDue(v);
                    }}
                  />
                </div>
              </div>
              <div className="setting">
                <span>
                  <Users size={15} /> Cooks
                </span>
                <div className="stepper">
                  <button
                    aria-label="Fewer cooks"
                    disabled={cooks <= 1 || !!busy}
                    onClick={() => setCooks((c) => c - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <b>{cooks}</b>
                  <button
                    aria-label="More cooks"
                    disabled={cooks >= 3 || !!busy}
                    onClick={() => setCooks((c) => c + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              <div className="setting">
                <span>
                  <Flame size={15} /> Hob burners
                </span>
                <div className="stepper">
                  <button
                    aria-label="Fewer burners"
                    disabled={hobs <= 1 || !!busy}
                    onClick={() => setHobs((c) => c - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <b>{hobs}</b>
                  <button
                    aria-label="More burners"
                    disabled={hobs >= 3 || !!busy}
                    onClick={() => setHobs((c) => c + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              <div className="equipment-note">Plus one oven tray at 200°C.</div>
            </div>
            <button
              className="button primary full"
              onClick={draft}
              disabled={!!busy || !client}
            >
              Plan my dinner <ArrowRight size={16} />
            </button>
            <p className="smallprint">
              No account. No shopping. Just a workable plan.
            </p>
          </aside>
          <section className="plan-area" aria-label="Dinner plan">
            <div className="plan-heading">
              <div className="section-heading">
                <span className="small-number">02</span>
                <h2>{preview ? "Your proposed plan" : "Your dinner plan"}</h2>
              </div>
              <span className={`status-pill ${preview ? "draft" : ""}`}>
                {preview
                  ? "READY TO REVIEW"
                  : snapshot.active
                    ? "SAVED IN YOUR KITCHEN"
                    : "LET’S GET STARTED"}
              </span>
            </div>
            {error && (
              <div className="error" role="alert">
                <Info size={18} />
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {failed && (
              <div className="constraint-note" role="status">
                <strong>Let’s change the plan, not rush the cook.</strong>
                <p>
                  {failed.result.status === "infeasible"
                    ? "There isn’t a schedule that fits all the current appliance and serving-window constraints."
                    : "The search ran out of time before finding a checked schedule."}{" "}
                  Your saved dinner hasn’t changed.
                </p>
                {failed.alternative && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setPreview(failed.alternative);
                      setFailed(null);
                    }}
                  >
                    Review a verified two-cook plan <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <CheckCircle2 size={16} />
                {notice}
              </div>
            )}
            {result && (
              <>
                <div className="plan-summary">
                  <div>
                    <span className="eyebrow">EVERYTHING AT THE TABLE</span>
                    <div className="serve-time">
                      {time(result.finish)}
                      <span className={late ? "late" : "on-time"}>
                        {late ? `${late} min later` : "Right on time"}
                      </span>
                    </div>
                    <p>
                      {firstHands ? (
                        <>
                          Your next hands-on step starts at{" "}
                          <strong>{time(firstHands.start)}</strong>.
                        </>
                      ) : (
                        <>Dinner is ready to serve.</>
                      )}
                    </p>
                  </div>
                  <div className="summary-side">
                    <span>
                      <CheckCircle2 size={16} />
                      Every constraint checked
                    </span>
                    <span>
                      {problem.resources.hands}{" "}
                      {problem.resources.hands === 1 ? "cook" : "cooks"} ·{" "}
                      {problem.resources.hob} burners · {result.steps.length}{" "}
                      steps
                    </span>
                    <span>
                      {result.changed?.length
                        ? `${result.changed.length} steps adjusted · started steps held in place`
                        : "Appliances, attention and timing accounted for"}
                    </span>
                  </div>
                </div>
                <div className="timeline-header">
                  <h3>A place for every step</h3>
                  <div className="segmented" aria-label="Timeline view">
                    <button
                      aria-pressed={view === "dishes"}
                      onClick={() => setView("dishes")}
                    >
                      By dish
                    </button>
                    <button
                      aria-pressed={view === "equipment"}
                      onClick={() => setView("equipment")}
                    >
                      By equipment
                    </button>
                  </div>
                </div>
                <Timeline
                  result={result}
                  problem={problem}
                  previous={preview ? snapshot.active?.result : null}
                  view={view}
                  selected={selected}
                  onSelect={setSelected}
                />
                <div className="timeline-legend">
                  <span>
                    <i className="legend-fill" />
                    Cooking step
                  </span>
                  <span>
                    <i className="legend-outline" />
                    Previous position
                  </span>
                  <span>
                    <i className="legend-lock" />
                    Already started in simulation
                  </span>
                </div>
                {selected && (
                  <div className="step-detail">
                    <span
                      className="dish-dot"
                      style={{ background: color(selected.recipe) }}
                    />
                    <div>
                      <strong>{selected.title}</strong>
                      <p>
                        {time(selected.start)}–{time(selected.end)} ·{" "}
                        {selected.end - selected.start} minutes ·{" "}
                        {selected.mode}
                        {selected.lanes.some((l) => l.startsWith("hands:"))
                          ? " · Needs your attention"
                          : " · Hands free"}
                      </p>
                    </div>
                    <button
                      aria-label="Close step details"
                      onClick={() => setSelected(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                {preview ? (
                  <div className="review-strip">
                    <div>
                      <strong>
                        {snapshot.active
                          ? "A change you can check first."
                          : "Looks like dinner."}
                      </strong>
                      <p>
                        {snapshot.active
                          ? "Your saved plan stays put until you use this one."
                          : "Review the timings, then make this your plan."}
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => accept()}
                      disabled={!!busy}
                    >
                      Use this plan <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="next-strip">
                    <span className="next-label">UP NEXT</span>
                    <div>
                      <strong>
                        {firstHands?.title ?? "Bring everyone to the table"}
                      </strong>
                      <p>
                        {firstHands
                          ? `${time(firstHands.start)} · ${firstHands.end - firstHands.start} minutes`
                          : "Enjoy the evening."}
                      </p>
                    </div>
                    <Hand size={23} />
                  </div>
                )}
              </>
            )}
            {!result && !busy && (
              <div className="empty">
                <Utensils size={36} />
                <h3>Your table starts here.</h3>
                <p>Pick a few dishes and we’ll find room for them.</p>
              </div>
            )}
            <div className="busy-strip" role="status" aria-live="polite">
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  {busy}
                </>
              ) : (
                <>
                  <span className="quiet-dot" />
                  Timings are estimates. Adjust them to your kitchen.
                </>
              )}
            </div>
            <div className="change-section">
              <div>
                <h3>And when life happens?</h3>
                <p>
                  Try a change. Review the repair before it becomes your plan.
                </p>
              </div>
              <div className="change-actions">
                <button
                  disabled={
                    !!busy ||
                    !snapshot.active?.result.steps.some(
                      (s) => s.id === "lentils_simmer",
                    )
                  }
                  onClick={() => repair("delay")}
                >
                  <TimerReset size={17} />
                  <span>
                    Lentils need 8 more minutes
                    <small>Advance the demo to simmering</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
                <button
                  disabled={!!busy || !snapshot.active}
                  onClick={() => repair("oven")}
                >
                  <Unplug size={17} />
                  <span>
                    The oven isn’t available
                    <small>Check the hob alternatives</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
                <button
                  disabled={!!busy || !snapshot.active}
                  onClick={() => repair("help")}
                >
                  <Users size={17} />
                  <span>
                    I have another pair of hands
                    <small>Plan for two cooks</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        </div>
        <footer className="footer">
          <span>Made for the part of cooking the recipe leaves out.</span>
          <button className="text-button" onClick={() => setInfo(true)}>
            Under the lid <Code2 size={15} />
          </button>
        </footer>
      </main>
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Under the lid"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close explanation"
              onClick={() => setInfo(false)}
            >
              <X />
            </button>
            <p className="eyebrow">UNDER THE LID</p>
            <h2>
              Practical timing.
              <br />
              <em>Checkable decisions.</em>
            </h2>
            <p>
              Tabletime turns the recipes into a constraint problem. A HiGHS
              solver finds a schedule, and a separate checker verifies every
              resource, dependency and serving window.
            </p>
            <div className="fact-list">
              <div>
                <strong>Real scheduling</strong>
                <span>
                  Mixed-integer optimization, appliance alternatives, cookware
                  continuity, and repairs that preserve started steps.
                </span>
              </div>
              <div>
                <strong>Your kitchen remembers</strong>
                <span>
                  Plans survive reloads. Changes are proposals. A stale or
                  repeated confirmation can’t silently replace your dinner.
                </span>
              </div>
              <div>
                <strong>An assistant can use the same tools</strong>
                <span>
                  The self-hosted server implements MCP 2025-11-25 over
                  Streamable HTTP. This browser display talks to that server
                  when run locally, or uses the same engine on your device in
                  the public demo.
                </span>
              </div>
            </div>
            <p className="honest-note">
              Working prototype. Four original example recipes; no recipe
              import, live appliance control, sensors, or Alexa certification.
              Recipe timings and serving windows are illustrative. Advancing the
              clock simulates following the plan; it does not observe real
              cooking.
            </p>
            <details>
              <summary>
                Recent tool calls <ChevronDown size={14} />
              </summary>
              <div className="trace">
                {trace.map((t, i) => (
                  <div key={i}>
                    <code>{t.name}</code>
                    <span>{t.ms} ms</span>
                  </div>
                ))}
              </div>
            </details>
            <a
              className="button secondary"
              href="https://github.com/luoy16002-svg/tabletime"
              target="_blank"
              rel="noreferrer"
            >
              Source, tests & reproducible benchmark <ArrowUpRight size={15} />
            </a>
          </section>
        </div>
      )}
    </>
  );
}

function Timeline({ result, problem, previous, view, selected, onSelect }) {
  const finish = Math.max(result.finish, problem.due, 1),
    width = 820,
    left = 136,
    right = 20,
    plot = width - left - right;
  const recipeIds = [...new Set(result.steps.map((s) => s.recipe ?? "oven"))];
  const rows =
    view === "dishes"
      ? recipeIds.map((id) => ({
          id,
          label: nameOf(id),
          steps: result.steps.filter((s) => (s.recipe ?? "oven") === id),
        }))
      : [
          ...Object.entries(problem.resources).flatMap(([r, n]) =>
            Array.from({ length: n }, (_, i) => ({
              id: `${r}:${i}`,
              label:
                r === "hands"
                  ? `Cook ${i + 1}`
                  : r === "hob"
                    ? `Hob ${i + 1}`
                    : "Oven",
              steps: result.steps.filter((s) => s.lanes.includes(`${r}:${i}`)),
            })),
          ),
        ];
  const rowH = 53,
    top = 32,
    height = top + rows.length * rowH + 14,
    x = (v) => left + (plot * v) / finish;
  const ticks = Array.from(
    { length: Math.floor(finish / 10) + 1 },
    (_, i) => i * 10,
  );
  return (
    <div className="timeline-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cooking schedule finishing at ${time(result.finish)}. Click a step for details.`}
        className="timeline"
      >
        <defs>
          <pattern
            id="started-pattern"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 5L5 0" stroke="white" strokeOpacity=".26" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={top - 6}
              y2={height - 9}
              stroke="#e6e6de"
              strokeDasharray="2 4"
            />
            <text x={x(t)} y={15} textAnchor="middle" className="tick">
              {time(t)}
            </text>
          </g>
        ))}
        {rows.map((row, i) => (
          <g key={row.id}>
            <text x={0} y={top + i * rowH + 22} className="row-name">
              {row.label.length > 19 ? row.label.slice(0, 18) + "…" : row.label}
            </text>
            <line
              x1={left}
              x2={width - right}
              y1={top + i * rowH + 40}
              y2={top + i * rowH + 40}
              stroke="#efefe8"
            />
            {row.steps.map((s) => {
              const y = top + i * rowH + 4,
                w = Math.max(3, x(s.end) - x(s.start) - 2),
                old = previous?.steps.find((o) => o.id === s.id),
                fixed = problem.tasks.find((t) => t.id === s.id)?.fixed;
              return (
                <g
                  key={s.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.title}, ${time(s.start)} to ${time(s.end)}`}
                  onClick={() => onSelect(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(s);
                    }
                  }}
                  className="step-bar"
                >
                  <title>
                    {s.title} · {time(s.start)}–{time(s.end)} · {s.mode}
                  </title>
                  {old && old.start !== s.start && (
                    <rect
                      x={x(old.start)}
                      y={y + 2}
                      width={Math.max(3, x(old.end) - x(old.start) - 2)}
                      height={27}
                      fill="none"
                      stroke={color(s.recipe)}
                      strokeDasharray="3 3"
                      opacity=".45"
                    />
                  )}
                  <rect
                    x={x(s.start)}
                    y={y}
                    width={w}
                    height={31}
                    rx={4}
                    fill={color(s.recipe)}
                    stroke={selected?.id === s.id ? "#282d22" : "transparent"}
                    strokeWidth={2}
                  />
                  {fixed && (
                    <rect
                      x={x(s.start)}
                      y={y}
                      width={w}
                      height={31}
                      rx={4}
                      fill="url(#started-pattern)"
                    />
                  )}
                  {w > 38 && (
                    <text x={x(s.start) + 7} y={y + 19} className="bar-text">
                      {s.end - s.start}m
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
        {problem.now > 0 && (
          <g>
            <line
              x1={x(problem.now)}
              x2={x(problem.now)}
              y1={top - 6}
              y2={height - 4}
              stroke="#343f30"
              strokeWidth={1.5}
            />
            <text x={x(problem.now) + 5} y={height - 1} className="now-label">
              Demo now {time(problem.now)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if (new URLSearchParams(location.search).has("capture")) import("./capture.js");
