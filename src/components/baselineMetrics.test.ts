import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASCADE_SCENARIO,
  SUDDEN_BLACKOUT_SCENARIO,
  summarizeScenario,
} from '../sim';
import {
  buildBaselineRows,
  computeGapToOptimumPct,
  formatSignedPct,
} from './baselineMetrics';

test('computeGapToOptimumPct handles zero optimum and signed differences', () => {
  assert.equal(computeGapToOptimumPct(0, 0), 0);
  assert.equal(computeGapToOptimumPct(90, 100), -10);
  assert.equal(computeGapToOptimumPct(105, 100), 5);
  assert.equal(formatSignedPct(-0.82), '-0.8%');
  assert.equal(formatSignedPct(2.46), '+2.5%');
  assert.equal(formatSignedPct(-0.01), '0.0%');
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
