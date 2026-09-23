import React from "react";
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
  Info,
  LoaderCircle,
  Unplug,
  TimerReset,
  CheckCircle2,
  X,
  Code2,
} from "lucide-react";
import { recipes } from "../core/recipes.js";

const dishNotes = {
  lentils: ["THE COMFORTING ONE", "Smoky, rich & a little paprika"],
  courgettes: ["SOMETHING BRIGHT", "Golden edges, a squeeze of lemon"],
  couscous: ["THE EASY SIDE", "Fluffy grains & garden herbs"],
  flatbreads: ["FOR THE MIDDLE", "Warm, soft & made for sharing"],
};

function Stepper({ label, value, setValue, busy, icon: Icon, singular }) {
  return (
    <div className="setting counter-setting">
      <span className="setting-label">
        <Icon size={17} />
        {label}
      </span>
      <div className="stepper">
        <button
          aria-label={`Fewer ${singular}`}
          disabled={value <= 1 || busy}
          onClick={() => setValue(value - 1)}
        >
          <Minus size={14} />
        </button>
        <b aria-live="polite">{value}</b>
        <button
          aria-label={`More ${singular}`}
          disabled={value >= 3 || busy}
          onClick={() => setValue(value + 1)}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Workspace({
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
}) {
  const menuChanged =
    problem &&
    (cooks !== problem.resources.hands ||
      hobs !== problem.resources.hob ||
      due !== problem.due ||
      menu.slice().sort().join() !==
        [...new Set(problem.tasks.map((t) => t.recipe).filter(Boolean))]
          .sort()
          .join());
  return (
    <>
      <header className="top">
        <a className="brand" href="./" aria-label="Tabletime home">
          <span className="brand-symbol">
            <Utensils size={19} strokeWidth={1.6} />
          </span>
          tabletime<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#menu">Tonight’s menu</a>
          <a href="#plan">Dinner plan</a>
        </nav>
        <button className="text-button" onClick={() => setInfo(true)}>
          How it works <ArrowUpRight size={16} />
        </button>
      </header>
      <main>
        <section className="intro">
          <div className="intro-content">
            <p className="eyebrow">
              <span className="tiny-line" /> A LITTLE LESS JUGGLING
            </p>
            <h1>
              Dinner, <em>all together.</em>
            </h1>
            <p className="intro-copy">Good food. A little less chaos.</p>
            <p className="intro-detail">
              Get every dish to the table, at the same time.
            </p>
            <a className="hero-link" href="#plan">
              Find your dinner rhythm <ArrowRight size={18} />
            </a>
          </div>
          <figure className="hero-picture">
            <img
              src="./images/dinner-table.webp"
              alt="Lentils, lemon courgettes, herby couscous and warm flatbreads on a linen-covered table"
              fetchPriority="high"
              width="1536"
              height="1024"
            />
            <figcaption>
              <span className="picture-label">TONIGHT, WE’RE SHARING</span>
              <strong>A Mediterranean kind of evening.</strong>
              <span>
                <Leaf size={13} />
                Vegetarian · Four portions
              </span>
            </figcaption>
          </figure>
        </section>

        <section
          className="menu-section"
          id="menu"
          aria-labelledby="menu-title"
        >
          <div className="section-heading menu-heading">
            <div>
              <span className="section-kicker">01 / SET THE TABLE</span>
              <h2 id="menu-title">What sounds good?</h2>
            </div>
            <p>
              <span>{menu.length} dishes selected</span>
              <span className="menu-hint">
                Click a dish to add or leave it out.
              </span>
            </p>
          </div>
          <div className="recipe-list">
            {recipes.map((r) => (
              <button
                key={r.id}
                className={`recipe ${menu.includes(r.id) ? "chosen" : ""}`}
                style={{ "--dish": r.color }}
                onClick={() => toggle(r.id)}
                aria-pressed={menu.includes(r.id)}
                aria-label={r.title}
                disabled={!!busy}
              >
                <div className="recipe-image">
                  <img
                    src={`./images/${r.id}.webp`}
                    alt=""
                    width="1024"
                    height="1024"
                  />
                  <span className="recipe-check">
                    {menu.includes(r.id) ? (
                      <Check size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                  </span>
                  <span className="recipe-tag">{dishNotes[r.id][0]}</span>
                </div>
                <div className="recipe-copy">
                  <strong>{r.title}</strong>
                  <small>{dishNotes[r.id][1]}</small>
                </div>
              </button>
            ))}
          </div>
          <div className="kitchen-settings">
            <div className="setting time-setting">
              <label htmlFor="ready">
                <Clock3 size={17} />
                At the table by
              </label>
              <input
                id="ready"
                type="time"
                min="18:30"
                max="22:30"
                value={time(due)}
                disabled={!!busy}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  const v = h * 60 + m - (18 * 60 + 30);
                  if (v >= 0 && v <= 240) setDue(v);
                }}
              />
            </div>
            <Stepper
              label="Cooks"
              singular="cooks"
              value={cooks}
              setValue={setCooks}
              busy={!!busy}
              icon={Users}
            />
            <Stepper
              label="Hob burners"
              singular="burners"
              value={hobs}
              setValue={setHobs}
              busy={!!busy}
              icon={Flame}
            />
            <span className="equipment-note">
              + one oven
              <br />
              <span>200°C · one tray</span>
            </span>
            <button
              className="button primary plan-button"
              onClick={draft}
              disabled={!!busy || !client}
            >
              {busy ? <LoaderCircle size={18} className="spin" /> : null}Plan my
              dinner <ArrowRight size={17} />
            </button>
          </div>
          {menuChanged && (
            <p className="settings-changed" role="status">
              Your menu or kitchen has changed. Choose <b>Plan my dinner</b> to
              update the timings.
            </p>
          )}
        </section>

        <section
          className="plan-area"
          id="plan"
          aria-label="Dinner plan"
          aria-busy={!!busy}
        >
          <div className="plan-heading">
            <div>
              <span className="section-kicker">02 / FIND YOUR RHYTHM</span>
              <h2>
                {preview
                  ? "A little plan. A lovely dinner."
                  : "Your evening, timed together."}
              </h2>
            </div>
            <span className={`status-pill ${preview ? "draft" : ""}`}>
              <span />
              {preview
                ? "Ready to review"
                : snapshot.active
                  ? "Plan saved"
                  : "Let’s get started"}
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              <Info size={19} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
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
                  Review a verified two-cook plan <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {result && (
            <div className="schedule-card">
              <div className="plan-summary">
                <div className="serve-block">
                  <span className="section-kicker">
                    EVERYONE TO THE TABLE AT
                  </span>
                  <div className="serve-time">
                    {time(result.finish)}
                    <span className={late ? "late" : "on-time"}>
                      {late ? <Clock3 size={13} /> : <Check size={13} />}
                      {late ? `${late} min later` : "Right on time"}
                    </span>
                  </div>
                </div>
                <div className="summary-side">
                  <span>
                    <Users size={16} />
                    {problem.resources.hands}{" "}
                    {problem.resources.hands === 1 ? "cook" : "cooks"}
                    <i />
                    {problem.resources.hob} burners
                    <i />
                    {result.steps.length} steps
                  </span>
                  <p>
                    {result.changed?.length
                      ? `${result.changed.length} steps adjusted. Started steps stay put.`
                      : "A place for every dish, without double-booking you."}
                  </p>
                </div>
                <div className="checked-note">
                  <CheckCircle2 size={19} />
                  <span>
                    Timings & resources
                    <br />
                    <strong>independently checked</strong>
                  </span>
                </div>
              </div>
              <div className="timeline-header">
                <h3>Your kitchen, in step.</h3>
                <div className="segmented" aria-label="Timeline view">
                  <button
                    aria-pressed={view === "dishes"}
                    onClick={() => setView("dishes")}
                  >
                    <Utensils size={14} />
                    By dish
                  </button>
                  <button
                    aria-pressed={view === "equipment"}
                    onClick={() => setView("equipment")}
                  >
                    <Flame size={14} />
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
                  Started in simulation
                </span>
                <span className="timeline-hint">
                  Select a step for the details <ArrowUpRight size={13} />
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
                      {selected.end - selected.start} minutes · {selected.mode}{" "}
                      ·{" "}
                      {selected.lanes.some((l) => l.startsWith("hands:"))
                        ? "Needs your attention"
                        : "Hands free"}
                    </p>
                  </div>
                  <button
                    aria-label="Close step details"
                    onClick={() => setSelected(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {preview ? (
                <div className="review-strip">
                  <div className="review-icon">
                    <Utensils size={22} />
                  </div>
                  <div>
                    <strong>
                      {snapshot.active
                        ? "Make room for a change."
                        : "Looks like dinner."}
                    </strong>
                    <p>
                      {snapshot.active
                        ? "Take a look. Your saved plan stays put until you confirm."
                        : "The timings work. Make this your plan when you’re ready."}
                    </p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => accept()}
                    disabled={!!busy}
                  >
                    Use this plan <Check size={17} />
                  </button>
                </div>
              ) : (
                <div className="next-strip">
                  <div className="review-icon">
                    <Hand size={22} />
                  </div>
                  <div>
                    <span className="section-kicker">
                      UP NEXT{firstHands ? ` · ${time(firstHands.start)}` : ""}
                    </span>
                    <strong>
                      {firstHands?.title ?? "Bring everyone to the table"}
                    </strong>
                  </div>
                  <span className="next-duration">
                    {firstHands
                      ? `${firstHands.end - firstHands.start} min · hands on`
                      : "Enjoy the evening."}
                  </span>
                </div>
              )}
            </div>
          )}
          {!result && (
            <div className="empty">
              {busy ? (
                <LoaderCircle size={30} className="spin" />
              ) : (
                <Utensils size={32} />
              )}
              <h3>
                {busy
                  ? "Making room for everything…"
                  : "Your table starts here."}
              </h3>
              <p>One kitchen. A good plan. Dinner, together.</p>
            </div>
          )}
          <div className="busy-strip" role="status" aria-live="polite">
            {busy ? (
              <>
                <LoaderCircle size={15} className="spin" />
                {busy}
              </>
            ) : (
              <>
                <Clock3 size={14} />
                Timings are estimates. Adjust them to your kitchen.
              </>
            )}
          </div>
        </section>

        <section className="change-section" aria-labelledby="changes-title">
          <div className="change-heading">
            <div>
              <span className="section-kicker">03 / LEAVE A LITTLE ROOM</span>
              <h2 id="changes-title">Life happens. Dinner adapts.</h2>
            </div>
            <p>
              Try a change to your saved dinner.
              <br />
              You get the final say on every new plan.
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
              <span className="change-icon terracotta">
                <TimerReset size={22} />
              </span>
              <span>
                <strong>Lentils need 8 more minutes</strong>
                <small>Advance the demo to simmering</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              disabled={!!busy || !snapshot.active}
              onClick={() => repair("oven")}
            >
              <span className="change-icon olive">
                <Unplug size={22} />
              </span>
              <span>
                <strong>The oven isn’t available</strong>
                <small>Check the hob alternatives</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              disabled={!!busy || !snapshot.active}
              onClick={() => repair("help")}
            >
              <span className="change-icon ochre">
                <Users size={22} />
              </span>
              <span>
                <strong>Another pair of hands</strong>
                <small>Make a little room for two cooks</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          </div>
          {!snapshot.active && (
            <p className="change-note">
              Save your first plan above to try these kitchen changes.
            </p>
          )}
        </section>
        <footer className="footer">
          <div className="footer-wordmark">tabletime.</div>
          <span>Less juggling. More being at the table.</span>
          <button className="text-button" onClick={() => setInfo(true)}>
            Under the lid <Code2 size={15} />
          </button>
        </footer>
      </main>
    </>
  );
}
