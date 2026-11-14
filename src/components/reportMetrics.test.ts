import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  SUDDEN_BLACKOUT_SCENARIO,
  runSelfTests,
  summarizeScenario,
} from '../sim';
import {
  buildBaseScenarioTakeaways,
  buildReportCardRows,
  computeHeadlineStat,
  computeStrategyGrade,
  formatAdversarialSummary,
  formatRobustnessStat,
} from './reportMetrics';

test('computeStrategyGrade assigns A, B, and F strictly per rules', () => {
  assert.equal(computeStrategyGrade(100, 100, 0), 'A');
  assert.equal(computeStrategyGrade(95, 100, 0), 'A'); // beating optimum is A
  assert.equal(computeStrategyGrade(105, 100, 0), 'A'); // within 5% is A
  assert.equal(computeStrategyGrade(106, 100, 0), 'B'); // > 5% with 0 violations is B
  assert.equal(computeStrategyGrade(80, 100, 1), 'F'); // violations > 0 is always F
});

test('computeHeadlineStat always returns the optimum-tracking headline with zero safety violations', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);

  const t0 = computeHeadlineStat(blackoutSummary.steps, 0);
  assert.equal(t0.oursViolationsSoFar, 0);
  assert.equal(
    t0.headline,
    'Tracking 0.0% from the theoretical optimum, with zero safety violations'
  );

  const t50 = computeHeadlineStat(blackoutSummary.steps, 50);
  assert.equal(t50.oursViolationsSoFar, 0);
  assert.match(
    t50.headline,
    /^Tracking -0\.0%|0\.0%|-0\.1% from the theoretical optimum, with zero safety violations$/
  );

  const t71 = computeHeadlineStat(blackoutSummary.steps, 71);
  assert.equal(t71.oursViolationsSoFar, 0);
  assert.equal(
    t71.headline,
    'Tracking -0.8% from the theoretical optimum, with zero safety violations'
  );

  const cascadeSummary = summarizeScenario(CASCADE_SCENARIO);
  const cascade71 = computeHeadlineStat(cascadeSummary.steps, 71);
  assert.equal(
    cascade71.headline,
    'Tracking -1.1% from the theoretical optimum, with zero safety violations'
  );
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
  assert.match(takeaways[0].takeaway.headline, /^Tracking .* from the theoretical optimum/);
  assert.match(takeaways[1].takeaway.headline, /^Tracking .* from the theoretical optimum/);
});

test('formatRobustnessStat and formatAdversarialSummary compute text dynamically from runSelfTests(1000)', () => {
  const result = runSelfTests(1000);
  assert.equal(
    formatRobustnessStat(result),
    'tested across 1000 randomized disaster curves, 0 hard-constraint violations'
  );
  const advText = formatAdversarialSummary(result.adversarial);
  assert.match(
    advText,
    /^PASS · lying telecom across 100 curves: \+\d+\.\d extra dmg to others \(\+\d+\.\d\/run\), 0 invariant violations$/
  );

  // Verify formatters reflect arbitrary values rather than hardcoding
  const synthetic = {
    ...result,
    curvesTested: 250,
    failures: ['err1', 'err2'],
    adversarial: {
      ...result.adversarial,
      passed: false,
      scenariosTested: 40,
      extraDamageToOthers: 120.5,
      avgExtraDamagePerScenario: 3.01,
      failures: ['adv1'],
    },
  };
  assert.equal(
    formatRobustnessStat(synthetic),
    'tested across 250 randomized disaster curves, 2 hard-constraint violations'
  );
  assert.equal(
    formatAdversarialSummary(synthetic.adversarial),
    'FAIL · lying telecom across 40 curves: +120.5 extra dmg to others (+3.0/run), 1 invariant violations'
  );
});
