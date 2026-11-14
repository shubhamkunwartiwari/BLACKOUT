# BLACKOUT

**BLACKOUT — Grid Negotiation Control Room** is an interactive simulation of emergency power-grid allocation during a blackout. It models how critical services negotiate for constrained electricity, how a deterministic arbiter validates and commits allocations, and how different allocation strategies compare under changing supply conditions.

> **Scope:** BLACKOUT is a simulation and educational/analytical tool. It is not connected to a real power grid and must not be used to make live grid-dispatch or emergency-response decisions.

## What it does

- Simulates four critical-service agents: **Hospital, Water, Emergency, and Telecom**.
- Replays 72 five-minute steps (six hours) of changing electricity supply.
- Includes two built-in scenarios:
  - **Sudden blackout:** supply is 100 MW initially, falls to 30 MW, then recovers to 60 MW.
  - **Cascade:** supply gradually falls from 100 MW to 35 MW and remains constrained.
- Supports playback, pause, replay, timeline seeking, playback speed changes, and injecting a blackout during a replay.
- Runs a multi-round negotiation process and validates proposed allocations through a deterministic two-phase-commit arbiter.
- Falls back to a safe priority-ordered allocation when a proposal is invalid or the previous allocation is no longer feasible.
- Tracks allocation damage, Jain's fairness index, minimum-service violations, and cascading water-shortfall effects on hospital damage.
- Compares the negotiation strategy with static-priority, proportional, and myopic-optimum baselines.
- Includes randomized robustness checks and adversarial tests for an agent that misreports demand.

## How the simulation is configured

The default agent model is defined in `src/sim/scenarios.ts`.

| Agent | Demand | Minimum service | Priority |
|---|---:|---:|---:|
| Hospital | 30 MW | 15 MW | 10 |
| Water | 25 MW | 8 MW | 7 |
| Emergency | 15 MW | 6 MW | 9 |
| Telecom | 20 MW | 5 MW | 6 |

The total minimum-service requirement is **34 MW**. When available supply is below this threshold, the model enters a shedding regime and applies its deterministic priority ordering. The built-in scenarios contain 72 steps, with each step representing five minutes.

These values and the damage rules are model assumptions chosen for this simulation; they are not universal engineering standards.

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4 (Vite plugin)
- Motion
- Lucide React
- Google GenAI SDK (dependency present for Gemini integration)

## Getting started

### Requirements

- Node.js (use a current LTS release)
- npm

### Install and run

```bash
git clone https://github.com/shubhamkunwartiwari/BLACKOUT.git
cd BLACKOUT
npm install
npm run dev
```

Vite serves the app at [http://localhost:3000](http://localhost:3000).

### Environment variables

An example environment file is provided at `.env.example`.

- `GEMINI_API_KEY`: required only for Gemini API calls/features that use the Google GenAI integration.
- `APP_URL`: the deployed app URL where the hosting environment requires it (for example, self-referential links or callback URLs).

In Google AI Studio deployments, the comments in `.env.example` indicate that these values are injected through the platform's Secrets/runtime configuration. Do not commit real API keys or secrets to Git.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server on port 3000 |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run the TypeScript compiler without emitting files |
| `npm test` | Run the simulation engine test file configured in the current package script |

### Running the complete test set

The repository currently contains test files in the simulation, components, and hooks folders. The `npm test` script currently targets only `src/sim/engine.test.ts`. To run the other test files as well, use:

```bash
npx tsx --test \
  src/sim/engine.test.ts \
  src/components/baselineMetrics.test.ts \
  src/components/negotiationParser.test.ts \
  src/components/reportMetrics.test.ts \
  src/components/triageOrder.test.ts \
  src/hooks/replayHelpers.test.ts
```

## Project structure

```text
BLACKOUT/
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── components/
    │   ├── HeaderStrip.tsx
    │   ├── HeadlineStatBanner.tsx
    │   ├── HeroSupplyChart.tsx
    │   ├── PowerFlowDiagram.tsx
    │   ├── NegotiationVisualizer.tsx
    │   ├── CumulativeDamageChart.tsx
    │   ├── BaselineComparisonPanel.tsx
    │   ├── ResultsAcrossScenariosPanel.tsx
    │   ├── ScenarioDamageBarChart.tsx
    │   └── ReportCardModal.tsx
    ├── hooks/
    │   ├── useBlackoutReplay.ts
    │   └── replayHelpers.ts
    └── sim/
        ├── scenarios.ts
        ├── negotiate.ts
        ├── arbiter.ts
        ├── baselines.ts
        ├── metrics.ts
        ├── engine.ts
        └── selfTest.ts
```

### Where to look

- `src/sim/scenarios.ts` — agent definitions, built-in supply curves, and seeded random scenarios.
- `src/sim/negotiate.ts` — agent bidding and multi-round negotiation.
- `src/sim/arbiter.ts` — allocation validation, atomic commit, and deterministic fallback.
- `src/sim/baselines.ts` — static-priority, proportional, and myopic-optimum allocation strategies.
- `src/sim/metrics.ts` — damage, cascade penalty, fairness, and allocation helpers.
- `src/sim/engine.ts` — scenario execution and summary generation.
- `src/sim/selfTest.ts` — randomized and adversarial invariant checks.
- `src/hooks/useBlackoutReplay.ts` — replay state, playback controls, and blackout injection.
- `src/components/` — dashboard visualizations, comparisons, and report components.

## Metrics and interpretation

- **Damage:** a model-defined penalty based on each service's unmet demand and priority. A sustained water shortfall can activate an additional hospital penalty.
- **Jain's fairness index:** compares the services' allocation-to-demand ratios; values closer to 1 indicate more equal ratios.
- **Minimum-service violations:** counted when supply is sufficient to meet all minimum requirements but an allocation falls below an agent's minimum. Expected shedding below the aggregate minimum is treated separately.
- **Myopic optimum:** a per-step benchmark under the model's objective and constraints. It is not a globally optimal multi-step policy and should not be interpreted as a real-world dispatch optimum.

## Current limitations

- The agent set, demand, minimum-service levels, priorities, and built-in scenarios are defined in code rather than exposed as a general scenario editor.
- The built-in replay is a deterministic simulation; it does not ingest live grid telemetry.
- Results depend on the chosen damage function, priority values, and feasibility rules. Treat comparisons as model-relative.
- The default `npm test` command does not yet run every test file; see the complete test command above.

## Contributing

1. Create a focused branch for your change.
2. Keep simulation rules deterministic where possible and document any changed assumptions.
3. Add or update tests for new allocation rules, metrics, and replay behavior.
4. Run the full test command, `npm run lint`, and `npm run build` before opening a pull request.

## License

No license file was present in the repository at the time this README was added. Unless a license is added, assume the repository is not licensed for reuse or redistribution.
