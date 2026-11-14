import { Arbiter, computeSafeFallback, validateAllocation } from './arbiter';
import { runScenario } from './engine';
import {
  cloneAllocations,
  computeStepDamage,
  createDemandAllocations,
  createZeroAllocations,
  sortAgentsByPriorityAsc,
  sortAgentsByPriorityDesc,
  sumAllocations,
} from './metrics';
import { computeAgentBid, MAX_NEGOTIATION_ROUNDS } from './negotiate';
import { DEFAULT_AGENTS, generateRandomSupplyScenario } from './scenarios';
import type {
  AdversarialTestResult,
  Agent,
  AgentId,
  AllocationMap,
  SelfTestResult,
} from './types';

const EPS = 1e-6;

function runAdversarialNegotiateStep(
  agents: Agent[],
  prevAlloc: AllocationMap,
  supplyMw: number,
  lyingAgentId: AgentId
): { proposed: AllocationMap; bids: AllocationMap } {
  const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;

  // Lying agent always bids full demand_mw regardless of actual need (prevAlloc).
  const round1Bids = createZeroAllocations();
  for (const agent of agents) {
    round1Bids[agent.id] =
      agent.id === lyingAgentId
        ? agent.demand_mw
        : computeAgentBid(agent, prevAlloc[agent.id]);
  }

  const sumRound1Bids = sumAllocations(round1Bids);
  if (sumRound1Bids <= effectiveSupply + EPS) {
    return {
      proposed: cloneAllocations(round1Bids),
      bids: round1Bids,
    };
  }

  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);
  if (effectiveSupply < totalMin - 1e-9) {
    return {
      proposed: computeSafeFallback(agents, effectiveSupply),
      bids: round1Bids,
    };
  }

  // Initial feasible allocation proportional to distorted (bid - min_mw) headroom
  const workingAlloc = createZeroAllocations();
  let remaining = effectiveSupply;
  for (const agent of agents) {
    workingAlloc[agent.id] = agent.min_mw;
    remaining -= agent.min_mw;
  }

  if (remaining > EPS) {
    let totalBidHeadroom = 0;
    for (const agent of agents) {
      totalBidHeadroom += Math.max(0, round1Bids[agent.id] - agent.min_mw);
    }

    if (totalBidHeadroom > EPS) {
      const grantRatio = Math.min(1, remaining / totalBidHeadroom);
      for (const agent of agents) {
        const headroom = Math.max(0, round1Bids[agent.id] - agent.min_mw);
        const add = headroom * grantRatio;
        workingAlloc[agent.id] += add;
        remaining -= add;
      }
    }

    if (remaining > EPS) {
      for (const agent of sortAgentsByPriorityDesc(agents)) {
        if (remaining <= EPS) break;
        const headroom = Math.max(0, agent.demand_mw - workingAlloc[agent.id]);
        const add = Math.min(headroom, remaining);
        workingAlloc[agent.id] += add;
        remaining -= add;
      }
    }
  }

  // Concession rounds: the lying agent NEVER concedes
  const ascPriority = sortAgentsByPriorityAsc(agents);
  const descPriority = sortAgentsByPriorityDesc(agents);

  for (let round = 1; round <= MAX_NEGOTIATION_ROUNDS; round++) {
    const donor = ascPriority.find(
      (a) => a.id !== lyingAgentId && workingAlloc[a.id] > a.min_mw + EPS
    );
    const recipient = descPriority.find(
      (a) => workingAlloc[a.id] < a.demand_mw - EPS
    );

    if (
      !donor ||
      !recipient ||
      donor.id === recipient.id ||
      donor.priority >= recipient.priority
    ) {
      break;
    }

    const excess = workingAlloc[donor.id] - donor.min_mw;
    const gap = recipient.demand_mw - workingAlloc[recipient.id];
    const concession = Math.min(excess, gap);
    if (concession <= EPS) break;

    workingAlloc[donor.id] -= concession;
    workingAlloc[recipient.id] += concession;
  }

  return {
    proposed: workingAlloc,
    bids: round1Bids,
  };
}

/**
 * Simulates an adversarial ("lying") agent that always bids its full demand_mw
 * regardless of need and never concedes during negotiation rounds across
 * `iterations` (default 100) random supply scenarios.
 * Asserts Arbiter and validateAllocation keep supply-cap and min-floor invariants intact,
 * and measures extra cumulative damage inflicted on honest agents.
 */
export function runAdversarialTests(
  iterations: number = 100,
  agents: Agent[] = DEFAULT_AGENTS,
  lyingAgentId: AgentId = 'telecom'
): AdversarialTestResult {
  const failures: string[] = [];
  let stepsChecked = 0;
  let extraDamageToOthers = 0;
  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);

  for (let i = 0; i < iterations; i++) {
    const scenario = generateRandomSupplyScenario(i);
    const honestRecords = runScenario(scenario, agents);

    const arbiter = new Arbiter(agents, createDemandAllocations(agents));
    const waterHistory: number[] = [];
    let honestOthersDamage = 0;
    let adversarialOthersDamage = 0;

    for (let t = 0; t < scenario.supply_mw.length; t++) {
      stepsChecked++;
      const supplyMw = scenario.supply_mw[t];
      const honestRec = honestRecords[t];

      for (const agent of agents) {
        if (agent.id !== lyingAgentId) {
          honestOthersDamage += honestRec.damage_step[agent.id];
        }
      }

      const advStep = runAdversarialNegotiateStep(
        agents,
        arbiter.getCommitted(),
        supplyMw,
        lyingAgentId
      );
      const commitRes = arbiter.commit(advStep.proposed, supplyMw);
      const check = validateAllocation(
        agents,
        commitRes.allocations,
        supplyMw
      );

      if (!check.valid) {
        failures.push(
          `Adversarial curve ${i} step ${t}: ${check.violations.join(', ')}`
        );
        break;
      }

      const effectiveSupply = Number.isFinite(supplyMw)
        ? Math.max(0, supplyMw)
        : 0;
      const totalAlloc = sumAllocations(commitRes.allocations);
      if (totalAlloc > effectiveSupply + EPS) {
        failures.push(
          `Adversarial curve ${i} step ${t}: supply cap broken (${totalAlloc} > ${effectiveSupply})`
        );
        break;
      }

      if (effectiveSupply >= totalMin - 1e-9) {
        const floorBroken = agents.some(
          (agent) => commitRes.allocations[agent.id] < agent.min_mw - EPS
        );
        if (floorBroken) {
          failures.push(
            `Adversarial curve ${i} step ${t}: min-floor invariant broken`
          );
          break;
        }
      }

      const stepDamage = computeStepDamage(
        agents,
        commitRes.allocations,
        waterHistory
      );
      waterHistory.push(commitRes.allocations.water);

      for (const agent of agents) {
        if (agent.id !== lyingAgentId) {
          adversarialOthersDamage += stepDamage.damage_step[agent.id];
        }
      }
    }

    extraDamageToOthers += adversarialOthersDamage - honestOthersDamage;

    if (failures.length >= 10) {
      break;
    }
  }

  return {
    passed: failures.length === 0,
    scenariosTested: iterations,
    stepsChecked,
    lyingAgentId,
    extraDamageToOthers,
    avgExtraDamagePerScenario:
      iterations > 0 ? extraDamageToOthers / iterations : 0,
    failures,
  };
}

/**
 * Runs `iterations` (default 1000) random supply curves through `runScenario`
 * and verifies that hard constraints never break on any timestep, plus runs
 * adversarial lying-agent checks across 100 random scenarios.
 */
export function runSelfTests(
  iterations: number = 1000,
  agents: Agent[] = DEFAULT_AGENTS,
  adversarialIterations: number = 100
): SelfTestResult {
  const failures: string[] = [];
  let stepsChecked = 0;

  for (let i = 0; i < iterations; i++) {
    const scenario = generateRandomSupplyScenario(i);
    const records = runScenario(scenario, agents);

    if (records.length !== scenario.supply_mw.length) {
      failures.push(
        `Curve ${i}: expected ${scenario.supply_mw.length} steps, got ${records.length}`
      );
      continue;
    }

    for (const rec of records) {
      stepsChecked++;

      // 1. Validate arbiter invariants (sum <= supply, min_mw feasibility, shed lowest priority first, bounds)
      const check = validateAllocation(agents, rec.allocations, rec.supply_mw);
      if (!check.valid) {
        failures.push(
          `Curve ${i} step ${rec.t}: ${check.violations.join(', ')}`
        );
        break;
      }

      // 2. Strict sum <= supply check
      const total = sumAllocations(rec.allocations);
      if (total > rec.supply_mw + EPS) {
        failures.push(
          `Curve ${i} step ${rec.t}: sum(allocations)=${total} > supply=${rec.supply_mw}`
        );
        break;
      }

      // 3. Agents never bid below min_mw or above demand_mw
      for (const agent of agents) {
        const bid = rec.bids[agent.id];
        if (
          !Number.isFinite(bid) ||
          bid < agent.min_mw - EPS ||
          bid > agent.demand_mw + EPS
        ) {
          failures.push(
            `Curve ${i} step ${rec.t}: invalid bid for ${agent.id}: ${bid}`
          );
          break;
        }
      }

      // 4. Finite non-negative damage and valid Jain's fairness in [0, 1]
      if (!Number.isFinite(rec.damage_total) || rec.damage_total < -EPS) {
        failures.push(
          `Curve ${i} step ${rec.t}: invalid damage_total=${rec.damage_total}`
        );
        break;
      }
      if (
        !Number.isFinite(rec.fairness_jain) ||
        rec.fairness_jain < 0 - EPS ||
        rec.fairness_jain > 1 + EPS
      ) {
        failures.push(
          `Curve ${i} step ${rec.t}: invalid fairness_jain=${rec.fairness_jain}`
        );
        break;
      }
    }

    if (failures.length >= 10) {
      break;
    }
  }

  const adversarial = runAdversarialTests(adversarialIterations, agents);

  return {
    passed: failures.length === 0 && adversarial.passed,
    curvesTested: iterations,
    stepsChecked,
    failures,
    adversarial,
  };
}
