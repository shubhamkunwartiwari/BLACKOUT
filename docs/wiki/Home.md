# BLACKOUT — Grid Negotiation Control Room

BLACKOUT simulates how four critical services (hospital, water pumping, emergency services and telecom) share a collapsing power supply during a six-hour grid failure. Each service bids for power, a deterministic arbiter enforces hard safety limits, and the dashboard replays the whole negotiation step by step against three baseline strategies.

> **Scope:** BLACKOUT is a simulation and analysis tool. It is not connected to a real grid and must not be used for live dispatch or emergency-response decisions. Agent parameters and damage rules are model assumptions, not engineering standards.

**Contents**
1. [The model](#the-model)
2. [How one step is resolved](#how-one-step-is-resolved)
3. [Damage and fairness](#damage-and-fairness)
4. [Baselines](#baselines)
5. [Results](#results)
6. [Robustness testing](#robustness-testing)
7. [Using the dashboard](#using-the-dashboard)
8. [Project structure](#project-structure)
9. [Run, test, build](#run-test-build)
10. [Known limitations](#known-limitations)

---

## The model

The simulation runs 72 steps of 5 minutes (six hours). Defaults live in `src/sim/scenarios.ts`.

| Agent | Demand | Minimum safe load | Priority |
|---|---:|---:|---:|
| Hospital | 30 MW | 15 MW | 10 |
| Emergency | 15 MW | 6 MW | 9 |
| Water | 25 MW | 8 MW | 7 |
| Telecom | 20 MW | 5 MW | 6 |

The minimums add up to **34 MW**. That number matters: above it, every service can be kept safe and the agents negotiate over the remainder; below it, someone must be shed and the system switches to strict triage.

Two built-in scenarios:

- **Sudden blackout:** 100 MW until step 20, then 30 MW, recovering to 60 MW at step 50.
- **Cascade:** supply declines gradually from 100 MW to 35 MW (steps 10–40) and stays low.

## How one step is resolved

Every step goes through the same pipeline: **bid → negotiate → validate → commit (or fall back)**.

**1. Bids.** Each agent bids from its previous allocation:
`bid = min(demand, current + shortfall_urgency × priority_weight)`, never below its minimum. If the bids fit within supply, they are all granted and the step ends.

**2. Negotiation (supply ≥ 34 MW, bids exceed supply).** Everyone first receives their minimum; the remainder is shared in proportion to bid headroom. Then, for up to **5 rounds**, the lowest-priority agent holding more than its minimum concedes `min(its excess, the recipient's gap)` to the highest-priority agent still below demand. Rounds stop when nothing more can move or the donor is not lower priority than the recipient. Each concession is logged ("telecom conceded 0.24 MW to hospital").

**3. Triage (supply < 34 MW).** There is nothing to negotiate over, so negotiation is skipped. The arbiter walks agents from highest to lowest priority and gives each `min(its minimum, supply remaining)`: Hospital, then Emergency, then Water, then Telecom. At 30 MW, for example, Hospital gets 15, Emergency 6, Water 8 and Telecom 1.

**4. Two-phase-commit arbiter.** The proposed allocation is validated as a whole:

- no negative allocations, none above an agent's demand;
- total allocation ≤ supply;
- every agent at or above its minimum whenever supply can cover all minimums.

If valid, the full allocation is committed atomically. If not, the whole proposal is rejected and the deterministic safe allocation is used instead, so the system never holds a half-applied or inconsistent state. Agents propose; only the arbiter decides.

## Damage and fairness

- **Step damage per agent:** `((demand − allocation) / demand) × priority`. Total damage is the sum over all steps.
- **Water → hospital cascade:** if water has been below 50% of its demand for each of the previous 3 steps, hospital damage is multiplied by 1.5 and `water shortfall ratio × 5` is added, even if the hospital itself is fully served.
- **Fairness:** Jain's index over each agent's allocation/demand ratio (1.0 means everyone is served equally).

## Baselines

Every strategy is scored with the same damage function on the same supply curve.

| Strategy | Rule |
|---|---|
| **Static priority** | Fill agents in priority order up to demand. Ignores minimums. |
| **Proportional** | Split supply in proportion to demand. Ignores minimums and priority. |
| **Myopic optimum** | Each step, guarantee minimums (shedding lowest priority first if infeasible), then fill greedily by priority per MW of demand. |

A strategy is tagged **illegal** if it ever drops an agent below its minimum on a step where supply could have covered every minimum (≥ 34 MW).

## Results

Cumulative damage over 72 steps (lower is better) and the number of steps with a minimum-load violation:

| Scenario | Strategy | Damage | Min violations |
|---|---|---:|---:|
| Sudden blackout | **Negotiation (ours)** | **1042.5** | **0** |
| | Myopic optimum | 1050.4 | 0 |
| | Proportional | 1058.0 | 0 |
| | Static priority | 990.6 | 22 |
| Cascade | **Negotiation (ours)** | **1058.4** | **0** |
| | Myopic optimum | 1070.5 | 0 |
| | Proportional | 1065.7 | 36 |
| | Static priority | 1003.0 | 50 |

How to read this:

- **Static priority has the lowest raw damage, but only by being unsafe.** It starves water and telecom below their minimums on 22 and 50 steps. A damage number that comes from breaking safety limits is not a win.
- **The "myopic optimum" is a benchmark, not a lower bound.** It optimises each step on its own and ignores the 3-step cascade history, so the negotiation can edge past it (0.8% and 1.1%).
- **The violation count hides something in the blackout.** Below 34 MW the "minimum violation" test is not applied, so proportional shows 0 violations in the sudden blackout. But proportional pushes the **hospital below its 15 MW minimum on 30 steps (sudden blackout) and 36 steps (cascade)**. The negotiation and the optimum never do (0 steps).

## Robustness testing

Both checks run in the app and in `src/sim/selfTest.ts`.

- **Randomised curves:** 1000 random supply curves × 72 steps (72,000 checked steps), including extreme scarcity and exact boundary values such as 0 MW and 34 MW. Hard constraints (total ≤ supply, bounds, minimums when feasible) were never violated.
- **Adversarial agent:** one agent always bids its full demand and refuses to concede. Over 100 random scenarios the arbiter's invariants held in every case. The extra damage inflicted on the other agents depends on who lies:

| Lying agent | Extra damage to others (per scenario) |
|---|---:|
| Telecom | ~71 |
| Emergency | ~5 |
| Water | ~4 |
| Hospital | 0 |

The arbiter keeps the system safe regardless, but a low-priority agent that refuses to concede can still push damage onto others. A hospital that lies changes nothing, because it is already served first.

## Using the dashboard

- **Playback:** play, pause, replay, scrub the timeline, change speed, switch scenario.
- **Trigger blackout:** drops supply to 30 MW from the current step and re-simulates. Earlier steps are unchanged; the supply stays at 30 MW for the rest of the run.
- **Header checks:** "Σ allocation ≤ supply" (red if ever violated) and "minimum loads", which is green when met, amber **LOAD SHEDDING** when supply is below 34 MW, and red only if a minimum breaks while it should not.
- **Agent bars:** allocation against demand with the minimum marked. **Ghost mode** overlays what static priority would have allocated and tags anything under a safe minimum.
- **Power flow diagram:** grid supply into each agent, unmet demand dashed, plus an optional overlay of negotiation concessions. Concessions are shares of the bidding budget, not physical transfers between agents.
- **Negotiation exchange / triage order:** round-by-round concessions when negotiating; a priority-ordered rationing list with a running "remaining supply" counter when shedding.
- **Comparison:** baseline table, cumulative damage chart (absolute or difference-versus-optimum), results across both scenarios, and a **report card** that grades each strategy: A (no violations and within 5% of the optimum), B (no violations), F (any violation).

## Project structure

```
src/
  sim/            engine.ts, negotiate.ts, arbiter.ts, baselines.ts,
                  metrics.ts, scenarios.ts, selfTest.ts, types.ts
  components/     dashboard panels, charts, report card, metric helpers
  hooks/          replay engine and helpers
  App.tsx
```

The simulation in `src/sim` is plain TypeScript with no UI dependencies and runs entirely in the browser.

## Run, test, build

```bash
git clone https://github.com/shubhamkunwartiwari/BLACKOUT.git
cd BLACKOUT
npm install
npm run dev        # http://localhost:3000
npm test           # engine tests
npm run lint       # type-check
npm run build      # production build in dist/
```

`npm test` runs the engine tests (`src/sim/engine.test.ts`). The helper modules in `src/components` and `src/hooks` have their own `*.test.ts` files, which you can run with `npx tsx --test <file>`. Gemini features are optional and need `GEMINI_API_KEY`.

## Known limitations

- Four agents, two scenarios, one fixed damage function. The numbers are only meaningful relative to each other.
- The damage function is linear and weights priority heavily, which is why a strategy that zeroes low-priority agents can score low damage.
- Results are deterministic single runs per scenario, not statistical averages.
- The minimum-violation metric is silent below the 34 MW threshold; the hospital-below-minimum counts above are the safer measure there.
- Only one cross-service dependency is modelled (water → hospital).
