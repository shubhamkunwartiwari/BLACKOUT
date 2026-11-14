import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AGENTS,
  SUDDEN_BLACKOUT_SCENARIO,
  runScenario,
  type StepRecord,
} from '../sim';
import { computeTriageOrder, formatCompactMw } from './triageOrder';

test('computeTriageOrder depletes remaining supply by highest priority first in sudden_blackout shedding', () => {
  const steps = runScenario(SUDDEN_BLACKOUT_SCENARIO, DEFAULT_AGENTS);
  const sheddingStep = steps[20]; // supply = 30 MW < 34 MW min sum
  assert.equal(sheddingStep.shedding, true);

  const summary = computeTriageOrder(DEFAULT_AGENTS, sheddingStep);
  assert.equal(summary.supplyMw, 30);
  assert.equal(summary.totalMinMw, 34);
  assert.deepEqual(
    summary.rows.map((r) => r.id),
    ['hospital', 'emergency', 'water', 'telecom']
  );

  // Hospital (P10, min 15): covered, 15 MW remaining
  assert.equal(summary.rows[0].status, 'covered');
  assert.equal(summary.rows[0].receivedMw, 15);
  assert.equal(summary.rows[0].remainingAfterMw, 15);

  // Emergency (P9, min 6): covered, 9 MW remaining
  assert.equal(summary.rows[1].status, 'covered');
  assert.equal(summary.rows[1].receivedMw, 6);
  assert.equal(summary.rows[1].remainingAfterMw, 9);

  // Water (P7, min 8): covered, 1 MW remaining
  assert.equal(summary.rows[2].status, 'covered');
  assert.equal(summary.rows[2].receivedMw, 8);
  assert.equal(summary.rows[2].remainingAfterMw, 1);

  // Telecom (P6, min 5): partial (1 of 5 MW min), 0 MW remaining
  assert.equal(summary.rows[3].status, 'partial');
  assert.equal(summary.rows[3].receivedMw, 1);
  assert.equal(summary.rows[3].remainingAfterMw, 0);
});

test('computeTriageOrder marks mid-way partial in amber and subsequent agents as shed', () => {
  const customSteps = runScenario(
    { name: 'deep_blackout', supply_mw: [18] },
    DEFAULT_AGENTS
  );
  const step: StepRecord = customSteps[0];
  assert.equal(step.shedding, true);

  const summary = computeTriageOrder(DEFAULT_AGENTS, step);
  assert.deepEqual(
    summary.rows.map((r) => ({
      id: r.id,
      status: r.status,
      received: r.receivedMw,
      remAfter: r.remainingAfterMw,
    })),
    [
      { id: 'hospital', status: 'covered', received: 15, remAfter: 3 },
      { id: 'emergency', status: 'partial', received: 3, remAfter: 0 },
      { id: 'water', status: 'shed', received: 0, remAfter: 0 },
      { id: 'telecom', status: 'shed', received: 0, remAfter: 0 },
    ]
  );
});

test('formatCompactMw formats integers cleanly and decimals to 1 decimal place', () => {
  assert.equal(formatCompactMw(30), '30');
  assert.equal(formatCompactMw(34.00001), '34');
  assert.equal(formatCompactMw(1.46), '1.5');
  assert.equal(formatCompactMw(-0), '0');
});
