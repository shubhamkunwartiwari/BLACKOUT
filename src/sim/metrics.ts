import type { Agent, AgentId, AllocationMap } from './types';

export function createZeroAllocations(): AllocationMap {
  return {
    hospital: 0,
    water: 0,
    emergency: 0,
    telecom: 0,
  };
}

export function cloneAllocations(alloc: AllocationMap): AllocationMap {
  return {
    hospital: alloc.hospital,
    water: alloc.water,
    emergency: alloc.emergency,
    telecom: alloc.telecom,
  };
}

export function sumAllocations(alloc: AllocationMap): number {
  return alloc.hospital + alloc.water + alloc.emergency + alloc.telecom;
}

/**
 * Checks whether water allocation was strictly below 50% of water demand
 * for the previous 3 consecutive steps.
 */
export function isCascadePenaltyActive(
  waterAllocHistory: number[],
  waterDemandMw: number
): boolean {
  if (waterAllocHistory.length < 3) {
    return false;
  }
  const threshold = 0.5 * waterDemandMw;
  const len = waterAllocHistory.length;
  return (
    waterAllocHistory[len - 1] < threshold &&
    waterAllocHistory[len - 2] < threshold &&
    waterAllocHistory[len - 3] < threshold
  );
}

/**
 * Computes per-agent step damage:
 *   damage_step[agent] = ((demand - alloc) / demand) * priority
 *   + cascade penalty: if water alloc < 50% of demand for the previous 3 steps,
 *     hospital damage is multiplied by 1.5.
 */
export function computeStepDamage(
  agents: Agent[],
  allocations: AllocationMap,
  waterAllocHistory: number[]
): {
  damage_step: AllocationMap;
  damage_step_total: number;
  cascade_active: boolean;
} {
  const waterAgent = agents.find((a) => a.id === 'water');
  const cascadeActive = waterAgent
    ? isCascadePenaltyActive(waterAllocHistory, waterAgent.demand_mw)
    : false;
  const waterShortfallRatio =
    waterAgent && waterAgent.demand_mw > 0
      ? Math.max(0, (waterAgent.demand_mw - allocations.water) / waterAgent.demand_mw)
      : 0;

  const damage_step: AllocationMap = createZeroAllocations();
  let damage_step_total = 0;

  for (const agent of agents) {
    const alloc = allocations[agent.id];
    const shortfallRatio = Math.max(
      0,
      (agent.demand_mw - alloc) / agent.demand_mw
    );
    let dmg = shortfallRatio * agent.priority;
    if (agent.id === 'hospital' && cascadeActive) {
      dmg = dmg * 1.5 + waterShortfallRatio * 5;
    }
    damage_step[agent.id] = dmg;
    damage_step_total += dmg;
  }

  return {
    damage_step,
    damage_step_total,
    cascade_active: cascadeActive,
  };
}

/**
 * Returns true if supply >= sum(min_mw) and at least one agent receives < min_mw.
 * When supply < sum(min_mw), load shedding is expected and not counted as a violation.
 */
export function hasMinViolation(
  agents: Agent[],
  allocations: AllocationMap,
  supplyMw: number
): boolean {
  const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;
  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);
  if (effectiveSupply < totalMin - 1e-9) {
    return false;
  }
  return agents.some((agent) => allocations[agent.id] < agent.min_mw - 1e-6);
}

/**
 * Jain's fairness index over alloc/demand ratios for a single step:
 *   J = (sum(x_i))^2 / (n * sum(x_i^2))
 */
export function computeJainsFairness(
  agents: Agent[],
  allocations: AllocationMap
): number {
  const n = agents.length;
  if (n === 0) return 1;

  let sumX = 0;
  let sumX2 = 0;

  for (const agent of agents) {
    const x = agent.demand_mw > 0 ? allocations[agent.id] / agent.demand_mw : 0;
    sumX += x;
    sumX2 += x * x;
  }

  if (sumX2 === 0) {
    return 1;
  }

  const index = (sumX * sumX) / (n * sumX2);
  return Math.min(1, Math.max(0, index));
}

export function sortAgentsByPriorityDesc(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => b.priority - a.priority);
}

export function sortAgentsByPriorityAsc(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => a.priority - b.priority);
}

export function createDemandAllocations(agents: Agent[]): AllocationMap {
  const map = createZeroAllocations();
  for (const agent of agents) {
    map[agent.id as AgentId] = agent.demand_mw;
  }
  return map;
}
