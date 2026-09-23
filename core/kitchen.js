import { recipes, dinnerProblem, repairProblem } from "./recipes.js";
import { solve } from "./solver.js";
import { checkSchedule } from "./model.js";

export const emptyState = () => ({
  schema: 1,
  revision: 0,
  active: null,
  drafts: {},
  receipts: {},
  events: [],
});
export class Kitchen {
  constructor(highs, state = emptyState(), save = () => {}) {
    this.highs = highs;
    this.state = structuredClone(state);
    this.save = save;
  }
  persist() {
    this.save(structuredClone(this.state));
  }
  snapshot() {
    return {
      revision: this.state.revision,
      active: this.state.active,
      events: this.state.events.slice(-10),
    };
  }
  draft(problem, options = {}, label = "Dinner plan") {
    const result = solve(this.highs, problem, {
      previous: options.previous,
      seconds: options.seconds ?? 3,
    });
    if (result.status !== "feasible") return { result };
    const id = crypto.randomUUID(),
      proposal = {
        id,
        baseRevision: this.state.revision,
        problem,
        result,
        label,
      };
    this.state.drafts[id] = proposal;
    const keys = Object.keys(this.state.drafts);
    if (keys.length > 20) delete this.state.drafts[keys[0]];
    this.persist();
    return { proposal, result };
  }
  call(name, args = {}) {
    switch (name) {
      case "kitchen_menu":
        return {
          recipes,
          assumptions: [
            "Four portions. Estimated recipe timings.",
            "One oven tray at 200°C; two hob burners; one cook by default.",
            "Serving windows describe eating quality, not food-safety limits.",
            "This prototype has no sensors and cannot operate appliances.",
          ],
        };
      case "read_dinner":
        return this.snapshot();
      case "draft_dinner":
        return this.draft(
          dinnerProblem(args.recipes ?? recipes.map((r) => r.id), {
            due: args.readyIn ?? 60,
            resources: {
              hands: args.cooks ?? 1,
              hob: args.hobs ?? 2,
              oven: args.oven === false ? 0 : 1,
            },
          }),
          {},
          "Plan dinner",
        );
      case "draft_repair": {
        const a = this.state.active;
        if (!a) throw new Error("Confirm a dinner plan first.");
        if (args.expectedRevision !== this.state.revision)
          throw new Error(
            "This dinner has changed. Read it again before proposing a repair.",
          );
        if (
          (args.now ?? a.problem.now) > a.problem.now &&
          args.simulateProgress !== true
        )
          throw new Error(
            "This demo needs explicit simulated progress to advance the kitchen clock. No real cooking progress has been observed.",
          );
        const p = repairProblem(a.problem, a.result, {
          now: args.now ?? a.problem.now,
          delay: args.delay,
          ovenOff: args.ovenOff ?? false,
          hands: args.cooks,
        });
        const proposal = this.draft(
          p,
          { previous: a.result },
          args.ovenOff
            ? "Cook without the oven"
            : args.delay
              ? "Adjust for a delay"
              : "Update the plan",
        );
        if (proposal.result.status === "infeasible" && p.resources.hands < 2) {
          const alternative = this.draft(
            { ...p, resources: { ...p.resources, hands: 2 } },
            { previous: a.result, seconds: 2 },
            "Use two cooks",
          );
          if (alternative.proposal) proposal.alternative = alternative.proposal;
        }
        return proposal;
      }
      case "accept_dinner": {
        const { proposalId, expectedRevision, requestId } = args;
        if (
          typeof requestId !== "string" ||
          requestId.length < 8 ||
          requestId.length > 100
        )
          throw new Error(
            "A request ID is required to prevent duplicate changes.",
          );
        const receipt = this.state.receipts[requestId];
        if (receipt) {
          if (receipt.proposalId !== proposalId)
            throw new Error("This request ID was used for another proposal.");
          return { ...receipt, replayed: true };
        }
        const proposal = this.state.drafts[proposalId];
        if (!proposal)
          throw new Error("That proposal expired. Please generate it again.");
        if (
          expectedRevision !== this.state.revision ||
          proposal.baseRevision !== this.state.revision
        )
          throw new Error(
            "This dinner has changed. Review a fresh proposal before confirming.",
          );
        const checked = checkSchedule(proposal.problem, proposal.result);
        if (!checked.valid)
          throw new Error("The proposed schedule failed validation.");
        this.state.active = structuredClone(proposal);
        this.state.revision++;
        const event = {
          revision: this.state.revision,
          label: proposal.label,
          at: new Date().toISOString(),
          proposalId,
        };
        this.state.events.push(event);
        this.state.events = this.state.events.slice(-100);
        const result = {
          accepted: true,
          revision: this.state.revision,
          proposalId,
          active: this.state.active,
        };
        this.state.receipts[requestId] = result;
        // Keep the latest 100 idempotency receipts; old request IDs must not be reused.
        const keys = Object.keys(this.state.receipts);
        if (keys.length > 100) delete this.state.receipts[keys[0]];
        this.state.drafts = {};
        this.persist();
        return result;
      }
      default:
        throw new Error("Unknown kitchen tool.");
    }
  }
}
