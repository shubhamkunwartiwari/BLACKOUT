import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  SUDDEN_BLACKOUT_SCENARIO,
  summarizeScenario,
} from '../sim';
import {
  buildBaseScenarioTakeaways,
  buildReportCardRows,
  computeHeadlineStat,
  computeStrategyGrade,
} from './reportMetrics';

test('computeStrategyGrade assigns A, B, and F strictly per rules', () => {
  assert.equal(computeStrategyGrade(100, 100, 0), 'A');
  assert.equal(computeStrategyGrade(95, 100, 0), 'A'); // beating optimum is A
  assert.equal(computeStrategyGrade(105, 100, 0), 'A'); // within 5% is A
  assert.equal(computeStrategyGrade(106, 100, 0), 'B'); // > 5% with 0 violations is B
  assert.equal(computeStrategyGrade(80, 100, 1), 'F'); // violations > 0 is always F
});

test('computeHeadlineStat uses prevented copy only when static has violations and lower ours damage, otherwise tracks optimum', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);

  // At t=0: zero violations, tracking optimum
  const t0 = computeHeadlineStat(blackoutSummary.steps, 0);
  assert.equal(t0.mode, 'optimum_tracking');
  assert.match(t0.headline, /^Tracking 0\.0% from the theoretical optimum, with zero safety violations$/);

  // At t=50: static just violated (1 violation) and ours damage < static damage (+1.1%)
  const t50 = computeHeadlineStat(blackoutSummary.steps, 50);
  assert.equal(t50.staticViolationsSoFar, 1);
  assert.equal(t50.mode, 'prevented');
  assert.match(t50.headline, /prevented ~1\.1% more damage than static priority/);

  // At t=71: static damage is numerically lower only via 22 illegal violations; fallback avoids negative prevented %
  const t71 = computeHeadlineStat(blackoutSummary.steps, 71);
  assert.equal(t71.staticViolationsSoFar, 22);
  assert.equal(t71.mode, 'optimum_tracking');
  assert.match(t71.headline, /Tracking -0\.8% from the theoretical optimum, with zero safety violations/);
});

test('buildReportCardRows and buildBaseScenarioTakeaways grade both base scenarios accurately', () => {
  const blackoutRows = buildReportCardRows(
    summarizeScenario(SUDDEN_BLACKOUT_SCENARIO)
  );
  assert.equal(blackoutRows.find((r) => r.id === 'ours')!.grade, 'A');
  assert.equal(blackoutRows.find((r) => r.id === 'lp_optimum')!.grade, 'A');
  assert.equal(blackoutRows.find((r) => r.id === 'proportional')!.grade, 'A');
  assert.equal(blackoutRows.find((r) => r.id === 'static')!.grade, 'F');

  const cascadeRows = buildReportCardRows(summarizeScenario(CASCADE_SCENARIO));
  assert.equal(cascadeRows.find((r) => r.id === 'ours')!.grade, 'A');
  assert.equal(cascadeRows.find((r) => r.id === 'proportional')!.grade, 'F');
  assert.equal(cascadeRows.find((r) => r.id === 'static')!.grade, 'F');

  const takeaways = buildBaseScenarioTakeaways();
  assert.equal(takeaways.length, 2);
  assert.equal(takeaways[0].scenarioName, 'sudden_blackout');
  assert.equal(takeaways[1].scenarioName, 'cascade');
});
