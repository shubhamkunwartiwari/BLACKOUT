import type { Agent, AgentId, Scenario } from './types';

export const AGENT_IDS: AgentId[] = ['hospital', 'water', 'emergency', 'telecom'];

export const DEFAULT_AGENTS: Agent[] = [
  { id: 'hospital', demand_mw: 30, min_mw: 15, priority: 10 },
  { id: 'water', demand_mw: 25, min_mw: 8, priority: 7 },
  { id: 'emergency', demand_mw: 15, min_mw: 6, priority: 9 },
  { id: 'telecom', demand_mw: 20, min_mw: 5, priority: 6 },
];

export const TOTAL_STEPS = 72;

export const SUDDEN_BLACKOUT_SCENARIO: Scenario = {
  name: 'sudden_blackout',
  supply_mw: Array.from({ length: TOTAL_STEPS }, (_, t) => {
    if (t < 20) return 100;
    if (t < 50) return 30;
    return 60;
  }),
};

export const CASCADE_SCENARIO: Scenario = {
  name: 'cascade',
  supply_mw: Array.from({ length: TOTAL_STEPS }, (_, t) => {
    if (t < 10) return 100;
    if (t <= 40) {
      const progress = (t - 10) / 30;
      return Number((100 - progress * (100 - 35)).toFixed(4));
    }
    return 35;
  }),
};

export const DEFAULT_SCENARIOS: Scenario[] = [
  SUDDEN_BLACKOUT_SCENARIO,
  CASCADE_SCENARIO,
];

/**
 * Deterministic PRNG (Mulberry32) for reproducible stress testing.
 */
export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSupplyScenario(
  index: number,
  seed: number = 20261114
): Scenario {
  const rand = createPrng(seed + index * 7919);
  const supply_mw: number[] = [];

  // Cover edge regimes as well as fluctuating random disaster curves
  const mode = index % 5;
  let current = 20 + rand() * 100;

  for (let t = 0; t < TOTAL_STEPS; t++) {
    if (mode === 0) {
      // Pure uniform random across [0, 115] MW (exercises < min_mw, partial, and surplus)
      supply_mw.push(Number((rand() * 115).toFixed(4)));
    } else if (mode === 1) {
      // Random walk with shocks
      const shock = rand() < 0.15 ? (rand() - 0.5) * 60 : (rand() - 0.5) * 18;
      current = Math.max(0, Math.min(120, current + shock));
      supply_mw.push(Number(current.toFixed(4)));
    } else if (mode === 2) {
      // Extreme scarcity regime [0, 40] MW
      supply_mw.push(Number((rand() * 40).toFixed(4)));
    } else if (mode === 3) {
      // Boundary test: exact 0, exact min_mw sum (34), exact demand sum (90), etc.
      const anchors = [0, 5, 15, 21, 29, 34, 34.0001, 45, 60, 90, 100];
      supply_mw.push(anchors[Math.floor(rand() * anchors.length)]);
    } else {
      // Oscillating grid instability
      const base = 55 + Math.sin(t * 0.35 + rand() * 0.5) * 35;
      const noise = (rand() - 0.5) * 20;
      supply_mw.push(Number(Math.max(0, base + noise).toFixed(4)));
    }
  }

  return {
    name: `random_${index}`,
    supply_mw,
  };
}
