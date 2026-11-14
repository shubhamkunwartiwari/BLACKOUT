import { createZeroAllocations, sortAgentsByPriorityDesc } from './metrics';
import type { Agent, AllocationMap } from './types';

/**
 * Baseline 1: Static priority
 * Fill in priority order up to demand.
 */
export function allocateStaticPriority(
  agents: Agent[],
  supplyMw: number
): AllocationMap {
  const alloc = createZeroAllocations();
  let remaining = Math.max(0, supplyMw);

  for (const agent of sortAgentsByPriorityDesc(agents)) {
    const grant = Math.min(agent.demand_mw, remaining);
    alloc[agent.id] = grant;
    remaining = Math.max(0, remaining - grant);
  }

  return alloc;
}

/**
 * Baseline 2: Proportional
 * Split supply proportionally to demand (capped at demand).
 */
export function allocateProportional(
  agents: Agent[],
  supplyMw: number
): AllocationMap {
  const alloc = createZeroAllocations();
  const effectiveSupply = Math.max(0, supplyMw);
  const totalDemand = agents.reduce((acc, a) => acc + a.demand_mw, 0);

  if (totalDemand <= 0) {
    return alloc;
  }

  const ratio = Math.min(1, effectiveSupply / totalDemand);
  for (const agent of agents) {
    alloc[agent.id] = agent.demand_mw * ratio;
  }

  return alloc;
}

/**
 * Baseline 3: Myopic optimum
 * Per step, maximise priority-weighted served demand subject to min_mw and supply
 * (solved exactly by fractional greedy by priority/demand).
 * When supply < sum(min_mw), shed lowest priority first to maintain feasibility.
 */
export function allocateMyopicOptimum(
  agents: Agent[],
  supplyMw: number
): AllocationMap {
  const alloc = createZeroAllocations();
  const effectiveSupply = Math.max(0, supplyMw);
  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);

  if (effectiveSupply < totalMin) {
    let remaining = effectiveSupply;
    for (const agent of sortAgentsByPriorityDesc(agents)) {
      const grant = Math.min(agent.min_mw, remaining);
      alloc[agent.id] = grant;
      remaining = Math.max(0, remaining - grant);
    }
    return alloc;
  }

  // First satisfy all min_mw
  let remaining = effectiveSupply;
  for (const agent of agents) {
    alloc[agent.id] = agent.min_mw;
    remaining -= agent.min_mw;
  }

  // Fractional greedy by priority / demand_mw (highest marginal damage reduction per MW)
  const byValueDensity = [...agents].sort(
    (a, b) => b.priority / b.demand_mw - a.priority / a.demand_mw
  );

  for (const agent of byValueDensity) {
    if (remaining <= 0) break;
    const headroom = Math.max(0, agent.demand_mw - alloc[agent.id]);
    const add = Math.min(headroom, remaining);
    alloc[agent.id] += add;
    remaining = Math.max(0, remaining - add);
  }

  return alloc;
}
