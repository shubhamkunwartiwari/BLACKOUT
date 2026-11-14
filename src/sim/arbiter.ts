import {
  cloneAllocations,
  createDemandAllocations,
  createZeroAllocations,
  sortAgentsByPriorityDesc,
  sumAllocations,
} from './metrics';
import type { Agent, AllocationMap } from './types';

const EPS = 1e-6;

export interface ValidationResult {
  valid: boolean;
  violations: string[];
  normalized: AllocationMap;
}

export interface CommitResult {
  accepted: boolean;
  usedFallback: boolean;
  allocations: AllocationMap;
  violations: string[];
}

/**
 * Deterministic safe allocation for any supply level:
 * - If supply < sum(min_mw): shed lowest priority first.
 * - Else: grant min_mw to all, then fill remaining in priority order up to demand.
 */
export function computeSafeFallback(
  agents: Agent[],
  supplyMw: number
): AllocationMap {
  const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;
  const alloc = createZeroAllocations();
  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);
  const byPriority = sortAgentsByPriorityDesc(agents);

  if (effectiveSupply < totalMin) {
    let remaining = effectiveSupply;
    for (const agent of byPriority) {
      const grant = Math.min(agent.min_mw, remaining);
      alloc[agent.id] = grant;
      remaining = Math.max(0, remaining - grant);
    }
    return alloc;
  }

  let remaining = effectiveSupply;
  for (const agent of agents) {
    alloc[agent.id] = agent.min_mw;
    remaining = Math.max(0, remaining - agent.min_mw);
  }

  for (const agent of byPriority) {
    if (remaining <= 0) break;
    const headroom = Math.max(0, agent.demand_mw - alloc[agent.id]);
    const add = Math.min(headroom, remaining);
    alloc[agent.id] += add;
    remaining = Math.max(0, remaining - add);
  }

  return alloc;
}

/**
 * Validates all hard invariants for a proposed allocation at the given supply.
 */
export function validateAllocation(
  agents: Agent[],
  proposed: AllocationMap,
  supplyMw: number
): ValidationResult {
  const violations: string[] = [];
  const effectiveSupply = Number.isFinite(supplyMw) ? Math.max(0, supplyMw) : 0;
  const normalized = createZeroAllocations();

  if (!Number.isFinite(supplyMw) || supplyMw < 0) {
    violations.push(`Invalid supply_mw: ${supplyMw}`);
  }

  for (const agent of agents) {
    const val = proposed[agent.id];
    if (!Number.isFinite(val)) {
      violations.push(`Non-finite allocation for ${agent.id}: ${val}`);
      normalized[agent.id] = 0;
      continue;
    }
    if (val < -EPS) {
      violations.push(`Negative allocation for ${agent.id}: ${val}`);
    }
    if (val > agent.demand_mw + EPS) {
      violations.push(
        `Allocation for ${agent.id} (${val.toFixed(4)}) exceeds demand (${agent.demand_mw})`
      );
    }
    normalized[agent.id] = Math.min(agent.demand_mw, Math.max(0, val));
  }

  const total = sumAllocations(normalized);
  if (total > effectiveSupply + EPS) {
    violations.push(
      `Total allocation (${total.toFixed(4)}) exceeds supply (${effectiveSupply.toFixed(4)})`
    );
  } else if (total > effectiveSupply && total <= effectiveSupply + EPS) {
    // Clamp microscopic floating-point drift strictly within supply
    const scale = total > 0 ? effectiveSupply / total : 1;
    for (const agent of agents) {
      normalized[agent.id] *= scale;
    }
  }

  const totalMin = agents.reduce((acc, a) => acc + a.min_mw, 0);
  if (effectiveSupply >= totalMin - EPS) {
    for (const agent of agents) {
      if (normalized[agent.id] < agent.min_mw - EPS) {
        violations.push(
          `Allocation for ${agent.id} (${normalized[agent.id].toFixed(4)}) below min_mw (${agent.min_mw})`
        );
      }
    }
  } else {
    // When supply < sum(min_mw), lowest priority must be shed first
    const expectedShed = computeSafeFallback(agents, effectiveSupply);
    for (const agent of agents) {
      if (Math.abs(normalized[agent.id] - expectedShed[agent.id]) > 1e-4) {
        violations.push(
          `Scarcity shedding mismatch for ${agent.id}: got ${normalized[agent.id].toFixed(4)}, expected ${expectedShed[agent.id].toFixed(4)}`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    normalized,
  };
}

/**
 * Deterministic Two-Phase Commit Arbiter.
 * Phase 1: Validate full proposed allocation against all hard invariants.
 * Phase 2: Commit atomically if valid; otherwise reject and fall back to
 *          previous valid allocation (if still valid for current supply) or
 *          the deterministic safe fallback allocation.
 */
export class Arbiter {
  private readonly agents: Agent[];
  private committedState: AllocationMap;

  constructor(agents: Agent[], initialAllocation?: AllocationMap) {
    this.agents = agents;
    this.committedState = initialAllocation
      ? cloneAllocations(initialAllocation)
      : createDemandAllocations(agents);
  }

  public getCommitted(): AllocationMap {
    return cloneAllocations(this.committedState);
  }

  public commit(proposed: AllocationMap, supplyMw: number): CommitResult {
    // Phase 1: Validate proposed full allocation
    const validation = validateAllocation(this.agents, proposed, supplyMw);

    if (validation.valid) {
      // Phase 2: Atomic commit
      this.committedState = cloneAllocations(validation.normalized);
      return {
        accepted: true,
        usedFallback: false,
        allocations: cloneAllocations(this.committedState),
        violations: [],
      };
    }

    // Reject proposed; check if previous valid allocation remains valid under current supply
    const prevValidation = validateAllocation(
      this.agents,
      this.committedState,
      supplyMw
    );

    if (prevValidation.valid) {
      this.committedState = cloneAllocations(prevValidation.normalized);
      return {
        accepted: false,
        usedFallback: true,
        allocations: cloneAllocations(this.committedState),
        violations: validation.violations,
      };
    }

    // Previous allocation exceeds current supply or violates current feasibility:
    // compute deterministic safe fallback so inconsistent state is never possible.
    const safeFallback = computeSafeFallback(this.agents, supplyMw);
    this.committedState = cloneAllocations(safeFallback);
    return {
      accepted: false,
      usedFallback: true,
      allocations: cloneAllocations(this.committedState),
      violations: validation.violations,
    };
  }
}
