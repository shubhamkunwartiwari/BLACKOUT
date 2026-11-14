import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  DEFAULT_AGENTS,
  SUDDEN_BLACKOUT_SCENARIO,
  runScenario,
} from '../sim';
import {
  buildLiveScenario,
  checkStepInvariants,
  formatStepTime,
} from './replayHelpers';

test('formatStepTime converts 5-minute timesteps to HH:MM', () => {
  assert.equal(formatStepTime(0), '00:00');
  assert.equal(formatStepTime(1), '00:05');
  assert.equal(formatStepTime(12), '01:00');
  assert.equal(formatStepTime(71), '05:55');
});

test('buildLiveScenario drops supply to 30 MW from blackoutAtStep onward', () => {
  const untouched = buildLiveScenario(SUDDEN_BLACKOUT_SCENARIO, null);
  assert.deepEqual(untouched.supply_mw, SUDDEN_BLACKOUT_SCENARIO.supply_mw);

  const injected = buildLiveScenario(CASCADE_SCENARIO, 15, 30);
  assert.equal(injected.supply_mw.length, 72);
  for (let i = 0; i < 15; i++) {
    assert.equal(injected.supply_mw[i], CASCADE_SCENARIO.supply_mw[i]);
  }
  for (let i = 15; i < 72; i++) {
    assert.equal(injected.supply_mw[i], 30);
  }
});

test('checkStepInvariants reports safe, shedding, and violation states accurately', () => {
  const steps = runScenario(SUDDEN_BLACKOUT_SCENARIO);

  // Step 0: supply 100 MW -> both checks PASS (safe)
  const s0 = checkStepInvariants(steps[0], DEFAULT_AGENTS);
  assert.equal(s0.supplyCapStatus, 'safe');
  assert.equal(s0.minFloorStatus, 'safe');
  assert.equal(s0.minFloorLabel, 'PASS');

  // Step 25: supply 30 MW -> supplyCap safe, minFloor SHEDDING (degraded, not critical violation)
  const s25 = checkStepInvariants(steps[25], DEFAULT_AGENTS);
  assert.equal(s25.supplyCapStatus, 'safe');
  assert.equal(s25.minFloorStatus, 'degraded');
  assert.equal(s25.minFloorLabel, 'SHEDDING');

  // Simulated violation when supply >= 34 MW
  const violatedRecord = {
    ...steps[50],
    allocations: { hospital: 30, water: 15, emergency: 15, telecom: 0 },
  };
  const sv = checkStepInvariants(violatedRecord, DEFAULT_AGENTS);
  assert.equal(sv.minFloorStatus, 'critical');
  assert.equal(sv.minFloorLabel, 'VIOLATED');
});
