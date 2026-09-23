import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/libre-caslon-display/400.css";
import { recipes } from "../core/recipes.js";
import { makeClient } from "./client.js";
import "./style.css";
import Workspace from "./Workspace.jsx";

const BASE = 18 * 60 + 30;
const time = (m) => {
  const v = (BASE + m) % (24 * 60);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const color = (id) => recipes.find((r) => r.id === id)?.color ?? "#7c8178";
const nameOf = (id) => recipes.find((r) => r.id === id)?.title ?? "Oven";

function App() {
  const explanation = useRef(null);
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
  useEffect(() => {
    if (!info) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const modal = explanation.current;
    document.body.style.overflow = "hidden";
    modal.querySelector("button").focus();
    const onKey = (event) => {
      if (event.key === "Escape") setInfo(false);
      if (event.key !== "Tab") return;
      const items = [...modal.querySelectorAll("button, a, summary")].filter(
        (el) => el.offsetParent !== null,
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [info]);
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
      <Workspace
        {...{
          client,
          menu,
          cooks,
          hobs,
          due,
          snapshot,
          preview,
          busy,
          error,
          failed,
          selected,
          view,
          notice,
          result,
          problem,
          firstHands,
          late,
          time,
          color,
          setInfo,
          toggle,
          setCooks,
          setHobs,
          setDue,
          draft,
          accept,
          repair,
          setError,
          setFailed,
          setPreview,
          setSelected,
          setView,
          Timeline,
        }}
      />
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo(false)}>
          <section
            ref={explanation}
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
              cooking. Food images are generated illustrations of the example
              menu.
            </p>
            <p className="connection">
              <span className="quiet-dot" />
              {client?.mode ?? "Opening kitchen"}
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
    width = 1000,
    left = 204,
    right = 28,
    plot = width - left - right;
  const present = new Set(result.steps.map((s) => s.recipe ?? "oven"));
  const recipeIds = [...recipes.map((r) => r.id), "oven"].filter((id) =>
    present.has(id),
  );
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
  const rowH = 62,
    top = 38,
    height = top + rows.length * rowH + 14,
    x = (v) => left + (plot * v) / finish;
  const ticks = Array.from(
    { length: Math.floor(finish / 10) + 1 },
    (_, i) => i * 10,
  );
  return (
    <>
      <div className="mobile-schedule" aria-label="Cooking steps">
        {rows.map((row, index) => (
          <details key={`${view}-${row.id}`} open={index === 0}>
            <summary>
              {view === "dishes" && row.id !== "oven" && (
                <img
                  src={`./images/${row.id}.webp`}
                  alt=""
                  width="32"
                  height="32"
                />
              )}
              <span>
                {row.label}
                <small>
                  {row.steps.length} {row.steps.length === 1 ? "step" : "steps"}
                </small>
              </span>
              <ChevronDown size={15} />
            </summary>
            <div className="mobile-steps">
              {[...row.steps]
                .sort((a, b) => a.start - b.start)
                .map((step) => (
                  <button
                    key={step.id}
                    onClick={() => onSelect(step)}
                    className={selected?.id === step.id ? "selected" : ""}
                    style={{ "--dish": color(step.recipe) }}
                  >
                    <time>{time(step.start)}</time>
                    <span>
                      {step.title}
                      <small>
                        {step.end - step.start} min · {step.mode}
                        {problem.tasks.find((t) => t.id === step.id)?.fixed
                          ? " · Started in simulation"
                          : ""}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          </details>
        ))}
      </div>
      <div className="timeline-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`Cooking schedule finishing at ${time(result.finish)}. Click a step for details.`}
          className="timeline"
        >
          <defs>
            <clipPath id="dish-thumb">
              <circle cx="19" cy="19" r="19" />
            </clipPath>
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
                stroke="#e0e4d6"
                strokeDasharray="2 4"
              />
              <text
                x={x(t)}
                y={15}
                textAnchor="middle"
                className="tick"
                style={{
                  fill: "#7f8576",
                  fontSize: 12,
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {time(t)}
              </text>
            </g>
          ))}
          {rows.map((row, i) => (
            <g key={row.id}>
              {view === "dishes" && row.id !== "oven" && (
                <g transform={`translate(0,${top + i * rowH + 1})`}>
                  <image
                    href={`./images/${row.id}.webp`}
                    width="38"
                    height="38"
                    clipPath="url(#dish-thumb)"
                  />
                </g>
              )}
              <text
                x={view === "dishes" && row.id !== "oven" ? 50 : 0}
                y={top + i * rowH + 17}
                className="row-name"
                style={{
                  fill: "#35452f",
                  fontSize: 12.5,
                  fontWeight: 500,
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {row.label}
              </text>
              <text
                x={view === "dishes" && row.id !== "oven" ? 50 : 0}
                y={top + i * rowH + 33}
                className="row-subtitle"
                style={{
                  fill: "#89907e",
                  fontSize: 10,
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {row.steps.length} {row.steps.length === 1 ? "step" : "steps"}
              </text>
              <line
                x1={left}
                x2={width - right}
                y1={top + i * rowH + 48}
                y2={top + i * rowH + 48}
                stroke="#eeeee5"
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
                      height={34}
                      rx={5}
                      fill={color(s.recipe)}
                      stroke={selected?.id === s.id ? "#282d22" : "transparent"}
                      strokeWidth={2}
                    />
                    {fixed && (
                      <rect
                        x={x(s.start)}
                        y={y}
                        width={w}
                        height={34}
                        rx={5}
                        fill="url(#started-pattern)"
                      />
                    )}
                    {w > 38 && (
                      <text
                        x={x(s.start) + 7}
                        y={y + 21}
                        className="bar-text"
                        style={{
                          fill: "#fffaf0",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "DM Sans, sans-serif",
                        }}
                      >
                        {w > 98 ? `${s.title.split(" ")[0]} · ` : ""}
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
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if (new URLSearchParams(location.search).has("capture")) import("./capture.js");
