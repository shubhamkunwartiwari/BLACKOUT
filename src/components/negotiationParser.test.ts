import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  SUDDEN_BLACKOUT_SCENARIO,
  runScenario,
} from '../sim';
import { parseNegotiationLog } from './negotiationParser';

test('parseNegotiationLog parses nominal all-bids-granted steps', () => {
  const steps = runScenario(SUDDEN_BLACKOUT_SCENARIO);
  const events = parseNegotiationLog(steps[0]);
  assert.equal(events.length, 1);
  assert.equal(events[0].round, 1);
  assert.equal(events[0].kind, 'granted');
});

test('parseNegotiationLog parses shedding steps cleanly', () => {
  const steps = runScenario(SUDDEN_BLACKOUT_SCENARIO);
  const events = parseNegotiationLog(steps[25]);
  assert.equal(events.length, 1);
  assert.equal(events[0].round, 1);
  assert.equal(events[0].kind, 'shedding');
});

test('parseNegotiationLog parses multi-round concessions and settled round', () => {
  const steps = runScenario(SUDDEN_BLACKOUT_SCENARIO);
  const events = parseNegotiationLog(steps[58]);
  assert.ok(events.length >= 2);
  const concessions = events.filter((e) => e.kind === 'concession');
  assert.ok(concessions.length >= 1);
  for (const c of concessions) {
    assert.ok(c.from);
    assert.ok(c.to);
    assert.ok((c.amountMw ?? 0) > 0);
  }
  assert.equal(events[events.length - 1].kind, 'settled');

  const cascadeSteps = runScenario(CASCADE_SCENARIO);
  const cascadeEvents = parseNegotiationLog(cascadeSteps[71]);
  assert.ok(cascadeEvents.some((e) => e.kind === 'concession'));
  assert.equal(cascadeEvents[cascadeEvents.length - 1].kind, 'settled');
});
