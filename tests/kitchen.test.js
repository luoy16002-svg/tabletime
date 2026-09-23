import { test } from "node:test";
import assert from "node:assert/strict";
import loadHighs from "highs";
import { Kitchen, emptyState } from "../core/kitchen.js";
const highs = await loadHighs();
test("drafts do not replace dinner, duplicate confirms are idempotent, stale proposals fail", () => {
  let stored;
  const k = new Kitchen(highs, emptyState(), (s) => (stored = s));
  const one = k.call("draft_dinner", {
    recipes: ["lentils"],
    readyIn: 40,
  }).proposal;
  const two = k.call("draft_dinner", {
    recipes: ["couscous"],
    readyIn: 40,
  }).proposal;
  assert.equal(k.snapshot().active, null);
  const args = {
    proposalId: one.id,
    expectedRevision: 0,
    requestId: "request-0001",
  };
  assert.equal(k.call("accept_dinner", args).revision, 1);
  assert.equal(k.call("accept_dinner", args).replayed, true);
  assert.equal(k.snapshot().revision, 1);
  assert.throws(
    () => k.call("accept_dinner", { ...args, proposalId: two.id }),
    /another/,
  );
  assert.throws(
    () =>
      k.call("accept_dinner", {
        proposalId: two.id,
        expectedRevision: 0,
        requestId: "request-0002",
      }),
    /expired|changed/,
  );
  const restored = new Kitchen(highs, stored);
  assert.deepEqual(restored.snapshot(), k.snapshot());
});
test("advancing time cannot be presented as observed real-world progress", () => {
  const k = new Kitchen(highs);
  const d = k.call("draft_dinner", {
    recipes: ["lentils"],
    readyIn: 40,
  }).proposal;
  k.call("accept_dinner", {
    proposalId: d.id,
    expectedRevision: 0,
    requestId: "request-0001",
  });
  assert.throws(
    () => k.call("draft_repair", { expectedRevision: 1, now: 25 }),
    /simulated/,
  );
  const a = k.snapshot().active;
  const simmer = a.result.steps.find((s) => s.id === "lentils_simmer");
  const repaired = k.call("draft_repair", {
    expectedRevision: 1,
    now: simmer.start + 1,
    simulateProgress: true,
    delay: { id: simmer.id, minutes: 8 },
  });
  assert.equal(repaired.result.status, "feasible");
  assert.equal(repaired.result.checked.valid, true);
  assert.equal(
    repaired.proposal.problem.tasks.find((t) => t.id === simmer.id).fixed.start,
    simmer.start,
  );
  assert.equal(k.snapshot().active.id, d.id);
});
