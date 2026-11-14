import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  SUDDEN_BLACKOUT_SCENARIO,
  summarizeScenario,
} from '../sim';
import {
  buildBaselineRows,
  buildScenarioDamageBarData,
  buildScenarioResultsRows,
  computeDifferenceScale,
  computeGapToOptimumPct,
  formatSignedDelta,
  formatSignedPct,
} from './baselineMetrics';

test('computeGapToOptimumPct handles zero optimum and signed differences', () => {
  assert.equal(computeGapToOptimumPct(0, 0), 0);
  assert.equal(computeGapToOptimumPct(90, 100), -10);
  assert.equal(computeGapToOptimumPct(105, 100), 5);
  assert.equal(formatSignedPct(-0.82), '-0.8%');
  assert.equal(formatSignedPct(2.46), '+2.5%');
  assert.equal(formatSignedPct(-0.01), '0.0%');
  assert.equal(formatSignedDelta(-7.92), '-7.9');
  assert.equal(formatSignedDelta(7.58), '+7.6');
  assert.equal(formatSignedDelta(-0.02), '0.0');
});

test('buildBaselineRows flags strategies with minViolations > 0 as illegal', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);
  const blackoutRows = buildBaselineRows(
    blackoutSummary.steps[71],
    blackoutSummary
  );

  const ours = blackoutRows.find((r) => r.id === 'ours')!;
  const staticRow = blackoutRows.find((r) => r.id === 'static')!;
  const propRow = blackoutRows.find((r) => r.id === 'proportional')!;
  const lpRow = blackoutRows.find((r) => r.id === 'lp_optimum')!;

  assert.equal(ours.isIllegal, false);
  assert.equal(ours.minViolations, 0);
  assert.equal(lpRow.isIllegal, false);
  assert.equal(propRow.isIllegal, false);
  assert.equal(staticRow.isIllegal, true);
  assert.equal(staticRow.minViolations, 22);

  const cascadeSummary = summarizeScenario(CASCADE_SCENARIO);
  const cascadeRows = buildBaselineRows(
    cascadeSummary.steps[71],
    cascadeSummary
  );
  assert.equal(cascadeRows.find((r) => r.id === 'proportional')!.isIllegal, true);
  assert.equal(cascadeRows.find((r) => r.id === 'static')!.isIllegal, true);
  assert.equal(cascadeRows.find((r) => r.id === 'ours')!.isIllegal, false);
});

test('computeDifferenceScale brackets zero and includes zero tick', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);
  const scale = computeDifferenceScale(blackoutSummary.steps);
  assert.ok(scale.min < 0, 'min should be negative when strategies beat optimum');
  assert.ok(scale.max > 0, 'max should be positive when proportional exceeds optimum');
  assert.ok(scale.ticks.includes(0), 'ticks must include 0 baseline');

  const cascadeSummary = summarizeScenario(CASCADE_SCENARIO);
  const cascadeScale = computeDifferenceScale(cascadeSummary.steps);
  assert.ok(cascadeScale.min < 0);
  assert.ok(cascadeScale.max > 0);
  assert.ok(cascadeScale.ticks.includes(0));
});

test('buildScenarioResultsRows returns final damage, avg fairness, and illegal tags', () => {
  const blackoutRows = buildScenarioResultsRows(
    summarizeScenario(SUDDEN_BLACKOUT_SCENARIO)
  );
  assert.equal(blackoutRows.length, 4);
  assert.equal(blackoutRows.find((r) => r.id === 'static')!.isIllegal, true);
  assert.equal(blackoutRows.find((r) => r.id === 'ours')!.isIllegal, false);

  const cascadeRows = buildScenarioResultsRows(
    summarizeScenario(CASCADE_SCENARIO)
  );
  assert.equal(cascadeRows.find((r) => r.id === 'proportional')!.isIllegal, true);
  assert.equal(cascadeRows.find((r) => r.id === 'static')!.isIllegal, true);
  // With the telecom->emergency dependency, our (dependency-blind) agents no
  // longer beat the myopic optimum in cascade; they must stay within 2% of it.
  const oursCascade = cascadeRows.find((r) => r.id === 'ours')!.finalDamage;
  const optCascade = cascadeRows.find((r) => r.id === 'lp_optimum')!.finalDamage;
  assert.ok(oursCascade <= optCascade * 1.02);
});

test('buildScenarioDamageBarData computes scale, optimum reference, and signed deltas', () => {
  const blackoutSummary = summarizeScenario(SUDDEN_BLACKOUT_SCENARIO);
  const cascadeSummary = summarizeScenario(CASCADE_SCENARIO);

  const data = buildScenarioDamageBarData([
    {
      scenarioName: blackoutSummary.scenarioName,
      rows: buildScenarioResultsRows(blackoutSummary),
    },
    {
      scenarioName: cascadeSummary.scenarioName,
      rows: buildScenarioResultsRows(cascadeSummary),
    },
  ]);

  assert.equal(data.scaleMax, 1400);
  assert.deepEqual(data.ticks, [0, 700, 1400]);
  assert.equal(data.blocks.length, 2);

  const boOurs = data.blocks[0].bars.find((b) => b.id === 'ours')!;
  const boOpt = data.blocks[0].bars.find((b) => b.id === 'lp_optimum')!;
  assert.ok(boOurs.deltaVsOptimum < 0, 'ours beats optimum in sudden_blackout');
  assert.equal(boOpt.deltaVsOptimum, 0);
  assert.ok(boOurs.widthRatio > 0 && boOurs.widthRatio <= 1);
});
