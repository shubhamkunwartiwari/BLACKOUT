import { validateAllocation } from './arbiter';
import { runScenario } from './engine';
import { sumAllocations } from './metrics';
import { DEFAULT_AGENTS, generateRandomSupplyScenario } from './scenarios';
import type { Agent, SelfTestResult } from './types';

const EPS = 1e-6;

/**
 * Runs `iterations` (default 1000) random supply curves through `runScenario`
 * and verifies that hard constraints never break on any timestep.
 */
export function runSelfTests(
  iterations: number = 1000,
  agents: Agent[] = DEFAULT_AGENTS
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

  return {
    passed: failures.length === 0,
    curvesTested: iterations,
    stepsChecked,
    failures,
  };
}
