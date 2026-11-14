import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Arbiter,
  CASCADE_SCENARIO,
  DEFAULT_AGENTS,
  SUDDEN_BLACKOUT_SCENARIO,
  allocateMyopicOptimum,
  allocateProportional,
  allocateStaticPriority,
  computeAgentBid,
  computeJainsFairness,
  computeStepDamage,
  hasMinViolation,
  negotiateStep,
  runAdversarialTests,
  runScenario,
  runSelfTests,
  sumAllocations,
  summarizeScenario,
} from './index';

test('default scenarios have 72 steps and expected supply curves', () => {
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw.length, 72);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[0], 100);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[19], 100);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[20], 30);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[49], 30);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[50], 60);
  assert.equal(SUDDEN_BLACKOUT_SCENARIO.supply_mw[71], 60);

  assert.equal(CASCADE_SCENARIO.supply_mw.length, 72);
  assert.equal(CASCADE_SCENARIO.supply_mw[0], 100);
  assert.equal(CASCADE_SCENARIO.supply_mw[10], 100);
  assert.equal(CASCADE_SCENARIO.supply_mw[40], 35);
  assert.equal(CASCADE_SCENARIO.supply_mw[71], 35);
});

test('agents never bid below min_mw or above demand_mw', () => {
  for (const agent of DEFAULT_AGENTS) {
    for (const current of [0, agent.min_mw * 0.5, agent.min_mw, agent.demand_mw, agent.demand_mw * 2]) {
      const bid = computeAgentBid(agent, current);
      assert.ok(bid >= agent.min_mw, `${agent.id} bid ${bid} < min_mw ${agent.min_mw}`);
      assert.ok(bid <= agent.demand_mw, `${agent.id} bid ${bid} > demand ${agent.demand_mw}`);
    }
  }
});

test('negotiation grants all bids in Round 1 when supply >= sum(bids)', () => {
  const prev = { hospital: 30, water: 25, emergency: 15, telecom: 20 };
  const res = negotiateStep(DEFAULT_AGENTS, prev, 100);
  assert.equal(res.proposed.hospital, 30);
  assert.equal(res.proposed.water, 25);
  assert.equal(res.proposed.emergency, 15);
  assert.equal(res.proposed.telecom, 20);
  assert.ok(res.log[0].includes('Round 1'));
});

test('negotiation logs concessions with round numbers and respects max 5 rounds', () => {
  const prev = { hospital: 30, water: 25, emergency: 15, telecom: 20 };
  const res = negotiateStep(DEFAULT_AGENTS, prev, 60);
  assert.ok(res.log.length >= 1);
  assert.ok(res.log.length <= 5);
  for (const entry of res.log) {
    assert.match(entry, /^Round [1-5]:/);
  }
  assert.ok(sumAllocations(res.proposed) <= 60 + 1e-6);
  for (const agent of DEFAULT_AGENTS) {
    assert.ok(res.proposed[agent.id] >= agent.min_mw - 1e-6);
  }
});

test('arbiter two-phase commit rejects invalid proposals and falls back safely', () => {
  const initial = { hospital: 15, water: 8, emergency: 6, telecom: 5 };
  const arbiter = new Arbiter(DEFAULT_AGENTS, initial);

  // Proposal exceeds supply (sum = 90 > 60): should reject and keep previous valid (sum = 34 <= 60)
  const overSupply = arbiter.commit(
    { hospital: 30, water: 25, emergency: 15, telecom: 20 },
    60
  );
  assert.equal(overSupply.accepted, false);
  assert.equal(overSupply.usedFallback, true);
  assert.deepEqual(overSupply.allocations, initial);

  // Proposal violates min_mw when supply=60 >= 34: should reject
  const belowMin = arbiter.commit(
    { hospital: 30, water: 25, emergency: 5, telecom: 0 },
    60
  );
  assert.equal(belowMin.accepted, false);
  assert.equal(belowMin.usedFallback, true);
  assert.deepEqual(belowMin.allocations, initial);

  // Supply drops below previous valid allocation (supply = 20 < 34): must compute safe shed fallback
  const lowSupply = arbiter.commit(
    { hospital: 10, water: 5, emergency: 5, telecom: 0 },
    20
  );
  assert.equal(lowSupply.accepted, false);
  assert.equal(lowSupply.usedFallback, true);
  // Shed lowest priority first: hospital gets 15, emergency gets 5, water 0, telecom 0
  assert.deepEqual(lowSupply.allocations, {
    hospital: 15,
    emergency: 5,
    water: 0,
    telecom: 0,
  });
});

test('damage applies 1.5x cascade penalty plus water shortfall ratio * 5 to hospital even when hospital is fully served', () => {
  const alloc = { hospital: 15, water: 8, emergency: 15, telecom: 20 };

  // Only 2 previous steps -> no cascade
  const noCascade = computeStepDamage(DEFAULT_AGENTS, alloc, [8, 8]);
  assert.equal(noCascade.cascade_active, false);
  assert.equal(noCascade.damage_step.hospital, 5);

  // 3 previous steps with one >= 12.5 -> no cascade
  const brokenStreak = computeStepDamage(DEFAULT_AGENTS, alloc, [8, 12.5, 8]);
  assert.equal(brokenStreak.cascade_active, false);
  assert.equal(brokenStreak.damage_step.hospital, 5);

  // 3 previous steps all < 12.5 -> 1.5x hospital base damage (5 * 1.5 = 7.5) + water shortfall ratio (17/25=0.68) * 5 (3.4) = 10.9
  const activeCascade = computeStepDamage(DEFAULT_AGENTS, alloc, [8, 8, 8]);
  assert.equal(activeCascade.cascade_active, true);
  assert.ok(Math.abs(activeCascade.damage_step.hospital - 10.9) < 1e-9);

  // Hospital fully served (30 MW), water at 8 MW with active cascade -> 0 * 1.5 + 0.68 * 5 = 3.4
  const fullHospitalCascade = computeStepDamage(
    DEFAULT_AGENTS,
    { hospital: 30, water: 8, emergency: 15, telecom: 20 },
    [8, 8, 8]
  );
  assert.equal(fullHospitalCascade.cascade_active, true);
  assert.ok(Math.abs(fullHospitalCascade.damage_step.hospital - 3.4) < 1e-9);
});

test('Jain fairness index equals 1 when ratios are equal and < 1 when unequal', () => {
  const equal = computeJainsFairness(DEFAULT_AGENTS, {
    hospital: 15,
    water: 12.5,
    emergency: 7.5,
    telecom: 10,
  });
  assert.ok(Math.abs(equal - 1) < 1e-9);

  const unequal = computeJainsFairness(DEFAULT_AGENTS, {
    hospital: 30,
    water: 0,
    emergency: 0,
    telecom: 0,
  });
  assert.ok(Math.abs(unequal - 0.25) < 1e-9);
});

test('baselines behave according to specification', () => {
  const s60 = 60;
  const staticAlloc = allocateStaticPriority(DEFAULT_AGENTS, s60);
  assert.deepEqual(staticAlloc, {
    hospital: 30,
    emergency: 15,
    water: 15,
    telecom: 0,
  });

  const propAlloc = allocateProportional(DEFAULT_AGENTS, 45);
  assert.deepEqual(propAlloc, {
    hospital: 15,
    water: 12.5,
    emergency: 7.5,
    telecom: 10,
  });

  // Myopic optimum fills min_mw (34), remaining 26 goes by priority/demand:
  // emergency (0.60) +9=15, hospital (0.333) +15=30, telecom (0.30) +2=7, water (0.28) +0=8
  const lpAlloc = allocateMyopicOptimum(DEFAULT_AGENTS, s60);
  assert.deepEqual(lpAlloc, {
    hospital: 30,
    emergency: 15,
    telecom: 7,
    water: 8,
  });
});

test('runScenario produces 72 valid step records for both default scenarios', () => {
  for (const scenario of [SUDDEN_BLACKOUT_SCENARIO, CASCADE_SCENARIO]) {
    const records = runScenario(scenario);
    assert.equal(records.length, 72);
    for (let i = 0; i < records.length; i++) {
      assert.equal(records[i].t, i);
      assert.ok(sumAllocations(records[i].allocations) <= records[i].supply_mw + 1e-6);
      assert.ok(records[i].fairness_jain >= 0 && records[i].fairness_jain <= 1);
      if (i > 0) {
        assert.ok(records[i].damage_total >= records[i - 1].damage_total);
      }
    }
  }
});

test('1000 random supply curves pass all hard constraint assertions', () => {
  const result = runSelfTests(1000);
  assert.equal(result.passed, true, `Self-test failures: ${result.failures.join(' | ')}`);
  assert.equal(result.curvesTested, 1000);
  assert.equal(result.stepsChecked, 72000);
  assert.equal(result.adversarial.passed, true);
  assert.equal(result.adversarial.scenariosTested, 100);
  assert.equal(result.adversarial.stepsChecked, 7200);
  assert.equal(result.adversarial.failures.length, 0);
});

test('adversarial lying agent distorts bidding and increases damage to others without breaking invariants', () => {
  const adv = runAdversarialTests(100, DEFAULT_AGENTS, 'telecom');
  assert.equal(adv.passed, true, `Adversarial failures: ${adv.failures.join(' | ')}`);
  assert.equal(adv.scenariosTested, 100);
  assert.equal(adv.stepsChecked, 7200);
  assert.equal(adv.lyingAgentId, 'telecom');
  assert.equal(adv.failures.length, 0);
  assert.ok(
    Number.isFinite(adv.extraDamageToOthers) && adv.extraDamageToOthers > 0,
    `Expected lying agent to inflict positive extra damage on others, got ${adv.extraDamageToOthers}`
  );
  assert.ok(
    Math.abs(adv.avgExtraDamagePerScenario - adv.extraDamageToOthers / 100) < 1e-9
  );
});

test('shedding flag is true strictly when supply < sum(min_mw)', () => {
  const blackoutSteps = runScenario(SUDDEN_BLACKOUT_SCENARIO);
  for (const step of blackoutSteps) {
    if (step.t >= 20 && step.t < 50) {
      assert.equal(step.shedding, true, `step ${step.t} (supply=30) should be shedding`);
    } else {
      assert.equal(step.shedding, false, `step ${step.t} (supply=${step.supply_mw}) should not be shedding`);
    }
  }

  const cascadeSteps = runScenario(CASCADE_SCENARIO);
  for (const step of cascadeSteps) {
    assert.equal(step.shedding, false, `cascade step ${step.t} (supply=${step.supply_mw}) should not be shedding`);
  }
});

test('minViolations counts steps with min_mw breaches only when supply >= sum(min_mw)', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);
  assert.equal(blackoutSummary.minViolations.ours, 0);
  assert.equal(blackoutSummary.minViolations.lp_optimum, 0);
  // At supply=60 (steps 50..71, 22 steps), static gives telecom 0 (<5), proportional gives all >= min_mw
  assert.equal(blackoutSummary.minViolations.static, 22);
  assert.equal(blackoutSummary.minViolations.proportional, 0);

  const cascadeSummary = summarizeScenario(CASCADE_SCENARIO);
  assert.equal(cascadeSummary.minViolations.ours, 0);
  assert.equal(cascadeSummary.minViolations.lp_optimum, 0);
  assert.ok(cascadeSummary.minViolations.static > 0);
  assert.ok(cascadeSummary.minViolations.proportional > 0);

  // Direct check: shedding step (< 34 MW) does not count as a violation
  assert.equal(
    hasMinViolation(
      DEFAULT_AGENTS,
      { hospital: 15, water: 8, emergency: 6, telecom: 1 },
      30
    ),
    false
  );
  // Step with supply >= 34 MW and agent below min_mw counts as a violation
  assert.equal(
    hasMinViolation(
      DEFAULT_AGENTS,
      { hospital: 30, water: 15, emergency: 15, telecom: 0 },
      60
    ),
    true
  );
});

test('myopic optimum uses the same cascade damage function as ours', () => {
  const blackoutSteps = runScenario(SUDDEN_BLACKOUT_SCENARIO);
  // At step 50 (supply=60), lp_optimum gives hospital=30, water=8 with active 3-step cascade from steps 47-49
  const step50 = blackoutSteps[50];
  assert.equal(step50.baselines.lp_optimum.allocations.hospital, 30);
  assert.equal(step50.baselines.lp_optimum.allocations.water, 8);
  // Hospital damage = 0 * 1.5 + (17/25)*5 = 3.40
  assert.ok(Math.abs(step50.baselines.lp_optimum.damage_step.hospital - 3.4) < 1e-9);
});
