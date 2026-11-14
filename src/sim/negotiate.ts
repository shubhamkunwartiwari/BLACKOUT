import { computeSafeFallback } from './arbiter';
import {
  cloneAllocations,
  createZeroAllocations,
  sortAgentsByPriorityAsc,
  sortAgentsByPriorityDesc,
  sumAllocations,
} from './metrics';
import type { Agent, AllocationMap } from './types';

export const MAX_NEGOTIATION_ROUNDS = 5;
const EPS = 1e-6;

export interface NegotiationResult {
  proposed: AllocationMap;
  bids: AllocationMap;
  log: string[];
}

/**
 * Computes an agent's bid for the current round:
 *   bid = min(demand, current_alloc + shortfall_urgency * priority_weight)
 * Agents never bid below min_mw.
 */
export function computeAgentBid(agent: Agent, currentAlloc: number): number {
  const safeAlloc = Math.max(0, Math.min(agent.demand_mw, currentAlloc));
  const shortfall = Math.max(0, agent.demand_mw - safeAlloc);
  const shortfallUrgency =
    agent.demand_mw > 0 ? shortfall / agent.demand_mw : 0;
  const priorityWeight = agent.demand_mw * (0.5 + agent.priority / 20);
  const rawBid = safeAlloc + shortfallUrgency * priorityWeight;

  return Math.max(agent.min_mw, Math.min(agent.demand_mw, rawBid));
}

export function computeAllBids(
  agents: Agent[],
  currentAlloc: AllocationMap
): AllocationMap {
  const bids = createZeroAllocations();
  for (const agent of agents) {
    bids[agent.id] = computeAgentBid(agent, currentAlloc[agent.id]);
  }
  return bids;
}

/**
 * Builds an initial feasible allocation within supplyMw before round concessions,
 * guaranteeing min_mw for all agents and distributing remaining supply in
 * proportion to each agent's bid headroom above min_mw.
 */
function buildInitialFeasibleAllocation(
  agents: Agent[],
  bids: AllocationMap,
  supplyMw: number
): AllocationMap {
  const alloc = createZeroAllocations();
  let remaining = supplyMw;

  for (const agent of agents) {
    alloc[agent.id] = agent.min_mw;
    remaining -= agent.min_mw;
  }

  if (remaining <= EPS) {
    return alloc;
  }

  // Distribute remaining supply proportionally to (bid - min_mw)
  let totalBidHeadroom = 0;
  for (const agent of agents) {
    totalBidHeadroom += Math.max(0, bids[agent.id] - agent.min_mw);
  }

  if (totalBidHeadroom > EPS) {
    const grantRatio = Math.min(1, remaining / totalBidHeadroom);
    for (const agent of agents) {
      const headroom = Math.max(0, bids[agent.id] - agent.min_mw);
      const add = headroom * grantRatio;
      alloc[agent.id] += add;
      remaining -= add;
    }
  }

  // If any supply still remains (e.g. bids < supply < sum(demand)), fill by priority
  if (remaining > EPS) {
    for (const agent of sortAgentsByPriorityDesc(agents)) {
      if (remaining <= EPS) break;
      const headroom = Math.max(0, agent.demand_mw - alloc[agent.id]);
      const add = Math.min(headroom, remaining);
      alloc[agent.id] += add;
      remaining -= add;
    }
  }

  return alloc;
}

/**
 * Runs up to 5 negotiation rounds for a single timestep.
 */
export function negotiateStep(
  agents: Agent[],
  prevAlloc: AllocationMap,
  supplyMw: number
): NegotiationResult {
  const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;
  const log: string[] = [];

  // Round 1: all agents bid
  const round1Bids = computeAllBids(agents, prevAlloc);
  const sumRound1Bids = sumAllocations(round1Bids);

  if (sumRound1Bids <= effectiveSupply + EPS) {
    const granted = cloneAllocations(round1Bids);
    log.push(
      `Round 1: Sum of bids (${sumRound1Bids.toFixed(2)} MW) <= supply (${effectiveSupply.toFixed(2)} MW); all bids granted.`
    );
    return {
      proposed: granted,
      bids: round1Bids,
      log,
    };
  }

  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);
  if (effectiveSupply < totalMin - EPS) {
    const shedAlloc = computeSafeFallback(agents, effectiveSupply);
    log.push(
      `Round 1: Supply (${effectiveSupply.toFixed(2)} MW) < minimum threshold (${totalMin.toFixed(2)} MW); lowest-priority loads shed first.`
    );
    return {
      proposed: shedAlloc,
      bids: round1Bids,
      log,
    };
  }

  const workingAlloc = buildInitialFeasibleAllocation(
    agents,
    round1Bids,
    effectiveSupply
  );

  const ascPriority = sortAgentsByPriorityAsc(agents);
  const descPriority = sortAgentsByPriorityDesc(agents);

  for (let round = 1; round <= MAX_NEGOTIATION_ROUNDS; round++) {
    // Recompute round bids from current working allocation
    computeAllBids(agents, workingAlloc);

    // Lowest-priority agent holding strictly more than min_mw
    const donor = ascPriority.find(
      (a) => workingAlloc[a.id] > a.min_mw + EPS
    );

    // Highest-priority agent strictly below demand_mw
    const recipient = descPriority.find(
      (a) => workingAlloc[a.id] < a.demand_mw - EPS
    );

    if (!donor || !recipient || donor.id === recipient.id || donor.priority >= recipient.priority) {
      log.push(
        `Round ${round}: Allocation stable (no lower-priority excess to concede).`
      );
      break;
    }

    const excess = workingAlloc[donor.id] - donor.min_mw;
    const gap = recipient.demand_mw - workingAlloc[recipient.id];
    const concession = Math.min(excess, gap);

    if (concession <= EPS) {
      log.push(`Round ${round}: Allocation stable.`);
      break;
    }

    workingAlloc[donor.id] -= concession;
    workingAlloc[recipient.id] += concession;

    log.push(
      `Round ${round}: ${donor.id} (prio ${donor.priority}) conceded ${concession.toFixed(2)} MW to ${recipient.id} (prio ${recipient.priority}).`
    );
  }

  return {
    proposed: workingAlloc,
    bids: round1Bids,
    log,
  };
}
