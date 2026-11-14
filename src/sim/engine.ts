import { Arbiter } from './arbiter';
import {
  allocateMyopicOptimum,
  allocateProportional,
  allocateStaticPriority,
} from './baselines';
import {
  computeJainsFairness,
  computeStepDamage,
  createDemandAllocations,
  hasMinViolation,
} from './metrics';
import { negotiateStep } from './negotiate';
import { DEFAULT_AGENTS } from './scenarios';
import type {
  Agent,
  BaselineStepResult,
  Scenario,
  ScenarioSummary,
  StepRecord,
} from './types';

function evaluateBaselineStep(
  agents: Agent[],
  allocations: ReturnType<typeof allocateStaticPriority>,
  waterHistory: number[],
  cumulativeDamage: number
): { result: BaselineStepResult; nextCumulativeDamage: number } {
  const { damage_step, damage_step_total } = computeStepDamage(
    agents,
    allocations,
    waterHistory
  );
  const nextTotal = cumulativeDamage + damage_step_total;
  const fairness = computeJainsFairness(agents, allocations);

  return {
    result: {
      allocations,
      damage_step,
      damage_step_total,
      damage_total: nextTotal,
      fairness_jain: fairness,
    },
    nextCumulativeDamage: nextTotal,
  };
}

/**
 * Runs a full scenario (72 timesteps by default) and returns per-step records
 * comparing the multi-agent negotiation + two-phase commit arbiter against
 * static priority, proportional, and myopic LP optimum baselines.
 */
export function runScenario(
  scenario: Scenario,
  agents: Agent[] = DEFAULT_AGENTS
): StepRecord[] {
  const initialAlloc = createDemandAllocations(agents);
  const arbiter = new Arbiter(agents, initialAlloc);
  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);

  const records: StepRecord[] = [];

  let oursCumulative = 0;
  let staticCumulative = 0;
  let proportionalCumulative = 0;
  let lpCumulative = 0;

  const oursWaterHistory: number[] = [];
  const staticWaterHistory: number[] = [];
  const proportionalWaterHistory: number[] = [];
  const lpWaterHistory: number[] = [];

  for (let t = 0; t < scenario.supply_mw.length; t++) {
    const supplyMw = scenario.supply_mw[t];
    const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;
    const shedding = effectiveSupply < totalMin - 1e-9;
    const prevCommitted = arbiter.getCommitted();

    // 1. Multi-agent negotiation + Two-phase commit Arbiter
    const negotiation = negotiateStep(agents, prevCommitted, supplyMw);
    const commitResult = arbiter.commit(negotiation.proposed, supplyMw);
    const log = [...negotiation.log];

    if (commitResult.usedFallback) {
      log.push(
        `Arbiter rejected proposal (${commitResult.violations.join('; ')}) and applied safe fallback.`
      );
    }

    const oursDamage = computeStepDamage(
      agents,
      commitResult.allocations,
      oursWaterHistory
    );
    oursCumulative += oursDamage.damage_step_total;
    const oursFairness = computeJainsFairness(agents, commitResult.allocations);

    // 2. Baselines (using the exact same damage function & separate water histories)
    const staticAlloc = allocateStaticPriority(agents, supplyMw);
    const staticEval = evaluateBaselineStep(
      agents,
      staticAlloc,
      staticWaterHistory,
      staticCumulative
    );
    staticCumulative = staticEval.nextCumulativeDamage;

    const proportionalAlloc = allocateProportional(agents, supplyMw);
    const proportionalEval = evaluateBaselineStep(
      agents,
      proportionalAlloc,
      proportionalWaterHistory,
      proportionalCumulative
    );
    proportionalCumulative = proportionalEval.nextCumulativeDamage;

    const lpAlloc = allocateMyopicOptimum(agents, supplyMw);
    const lpEval = evaluateBaselineStep(
      agents,
      lpAlloc,
      lpWaterHistory,
      lpCumulative
    );
    lpCumulative = lpEval.nextCumulativeDamage;

    // Record step water allocations AFTER evaluating cascade penalty (which checks previous 3 steps)
    oursWaterHistory.push(commitResult.allocations.water);
    staticWaterHistory.push(staticAlloc.water);
    proportionalWaterHistory.push(proportionalAlloc.water);
    lpWaterHistory.push(lpAlloc.water);

    records.push({
      t,
      supply_mw: supplyMw,
      allocations: commitResult.allocations,
      bids: negotiation.bids,
      damage_step: oursDamage.damage_step,
      damage_step_total: oursDamage.damage_step_total,
      damage_total: oursCumulative,
      cascade_active: oursDamage.cascade_active,
      telecom_dependency_active: oursDamage.telecom_dependency_active,
      shedding,
      fairness_jain: oursFairness,
      baselines: {
        static: staticEval.result,
        proportional: proportionalEval.result,
        lp_optimum: lpEval.result,
      },
      log,
    });
  }

  return records;
}

export function summarizeScenario(
  scenario: Scenario,
  agents: Agent[] = DEFAULT_AGENTS
): ScenarioSummary {
  const steps = runScenario(scenario, agents);
  const last = steps[steps.length - 1];
  const n = steps.length || 1;

  const avg = (getter: (s: StepRecord) => number) =>
    steps.reduce((acc, s) => acc + getter(s), 0) / n;

  return {
    scenarioName: scenario.name,
    steps,
    finalDamage: {
      ours: last ? last.damage_total : 0,
      static: last ? last.baselines.static.damage_total : 0,
      proportional: last ? last.baselines.proportional.damage_total : 0,
      lp_optimum: last ? last.baselines.lp_optimum.damage_total : 0,
    },
    minViolations: {
      ours: steps.filter((s) =>
        hasMinViolation(agents, s.allocations, s.supply_mw)
      ).length,
      static: steps.filter((s) =>
        hasMinViolation(agents, s.baselines.static.allocations, s.supply_mw)
      ).length,
      proportional: steps.filter((s) =>
        hasMinViolation(
          agents,
          s.baselines.proportional.allocations,
          s.supply_mw
        )
      ).length,
      lp_optimum: steps.filter((s) =>
        hasMinViolation(agents, s.baselines.lp_optimum.allocations, s.supply_mw)
      ).length,
    },
    avgFairness: {
      ours: avg((s) => s.fairness_jain),
      static: avg((s) => s.baselines.static.fairness_jain),
      proportional: avg((s) => s.baselines.proportional.fairness_jain),
      lp_optimum: avg((s) => s.baselines.lp_optimum.fairness_jain),
    },
  };
}
