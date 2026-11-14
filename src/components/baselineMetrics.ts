import type { ScenarioSummary, StepRecord } from '../sim';

export interface BaselineRow {
  id: 'ours' | 'lp_optimum' | 'proportional' | 'static';
  label: string;
  currentDamage: number;
  avgFairness: number;
  minViolations: number;
  isIllegal: boolean;
}

/**
 * Computes percentage gap between our cumulative damage and myopic optimum:
 *   ((ours - optimum) / optimum) * 100
 * Negative values mean lower (better) damage than the myopic optimum.
 */
export function computeGapToOptimumPct(
  oursDamage: number,
  optimumDamage: number
): number {
  if (!Number.isFinite(oursDamage) || !Number.isFinite(optimumDamage)) {
    return 0;
  }
  if (optimumDamage <= 1e-9) {
    return 0;
  }
  return ((oursDamage - optimumDamage) / optimumDamage) * 100;
}

export function formatSignedPct(pct: number): string {
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(1)}%`;
}

export function formatSignedDelta(delta: number): string {
  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(1)}`;
}

export interface DifferenceScale {
  min: number;
  max: number;
  ticks: number[];
}

const NICE_DIFF_STEPS = [2, 5, 10, 15, 20, 25, 50, 100, 200];

const ALL_SERIES_IDS: Array<'ours' | 'lp_optimum' | 'proportional' | 'static'> = [
  'ours',
  'lp_optimum',
  'proportional',
  'static',
];

export function computeDifferenceScale(
  steps: StepRecord[],
  visibleIds: ReadonlyArray<'ours' | 'lp_optimum' | 'proportional' | 'static'> = ALL_SERIES_IDS
): DifferenceScale {
  let rawMin = 0;
  let rawMax = 0;
  const visibleSet = new Set(visibleIds);

  for (const s of steps) {
    const opt = s.baselines.lp_optimum.damage_total;
    const diffs: number[] = [0];
    if (visibleSet.has('ours')) diffs.push(s.damage_total - opt);
    if (visibleSet.has('proportional')) {
      diffs.push(s.baselines.proportional.damage_total - opt);
    }
    if (visibleSet.has('static')) {
      diffs.push(s.baselines.static.damage_total - opt);
    }
    for (const d of diffs) {
      if (d < rawMin) rawMin = d;
      if (d > rawMax) rawMax = d;
    }
  }

  const rawSpan = Math.max(4, rawMax - rawMin);
  const targetStep = rawSpan / 4;
  const stepSize =
    NICE_DIFF_STEPS.find((candidate) => candidate >= targetStep) ??
    Math.ceil(targetStep / 50) * 50;

  let min = Math.floor(rawMin / stepSize) * stepSize;
  let max = Math.ceil(rawMax / stepSize) * stepSize;

  if (min === 0) min = -stepSize;
  if (max === 0) max = stepSize;

  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += stepSize) {
    ticks.push(Math.round(v));
  }

  return { min, max, ticks };
}

export function buildBaselineRows(
  currentRecord: StepRecord,
  summary: ScenarioSummary
): BaselineRow[] {
  return [
    {
      id: 'ours',
      label: 'Ours (Negotiation)',
      currentDamage: currentRecord.damage_total,
      avgFairness: summary.avgFairness.ours,
      minViolations: summary.minViolations.ours,
      isIllegal: summary.minViolations.ours > 0,
    },
    {
      id: 'lp_optimum',
      label: 'Myopic Optimum',
      currentDamage: currentRecord.baselines.lp_optimum.damage_total,
      avgFairness: summary.avgFairness.lp_optimum,
      minViolations: summary.minViolations.lp_optimum,
      isIllegal: summary.minViolations.lp_optimum > 0,
    },
    {
      id: 'proportional',
      label: 'Proportional',
      currentDamage: currentRecord.baselines.proportional.damage_total,
      avgFairness: summary.avgFairness.proportional,
      minViolations: summary.minViolations.proportional,
      isIllegal: summary.minViolations.proportional > 0,
    },
    {
      id: 'static',
      label: 'Static Priority',
      currentDamage: currentRecord.baselines.static.damage_total,
      avgFairness: summary.avgFairness.static,
      minViolations: summary.minViolations.static,
      isIllegal: summary.minViolations.static > 0,
    },
  ];
}

export interface ScenarioStrategyRow {
  id: 'ours' | 'lp_optimum' | 'proportional' | 'static';
  label: string;
  finalDamage: number;
  avgFairness: number;
  minViolations: number;
  isIllegal: boolean;
}

export function buildScenarioResultsRows(
  summary: ScenarioSummary
): ScenarioStrategyRow[] {
  return [
    {
      id: 'ours',
      label: 'Ours (Negotiation)',
      finalDamage: summary.finalDamage.ours,
      avgFairness: summary.avgFairness.ours,
      minViolations: summary.minViolations.ours,
      isIllegal: summary.minViolations.ours > 0,
    },
    {
      id: 'lp_optimum',
      label: 'Myopic Optimum',
      finalDamage: summary.finalDamage.lp_optimum,
      avgFairness: summary.avgFairness.lp_optimum,
      minViolations: summary.minViolations.lp_optimum,
      isIllegal: summary.minViolations.lp_optimum > 0,
    },
    {
      id: 'proportional',
      label: 'Proportional',
      finalDamage: summary.finalDamage.proportional,
      avgFairness: summary.avgFairness.proportional,
      minViolations: summary.minViolations.proportional,
      isIllegal: summary.minViolations.proportional > 0,
    },
    {
      id: 'static',
      label: 'Static Priority',
      finalDamage: summary.finalDamage.static,
      avgFairness: summary.avgFairness.static,
      minViolations: summary.minViolations.static,
      isIllegal: summary.minViolations.static > 0,
    },
  ];
}

export interface ScenarioDamageBarEntry extends ScenarioStrategyRow {
  shortLabel: string;
  deltaVsOptimum: number;
  widthRatio: number;
}

export interface ScenarioDamageChartBlock {
  scenarioName: string;
  optimumDamage: number;
  optimumRatio: number;
  bars: ScenarioDamageBarEntry[];
}

export interface ScenarioDamageBarChartData {
  scaleMax: number;
  ticks: number[];
  blocks: ScenarioDamageChartBlock[];
}

const SHORT_STRATEGY_LABELS: Record<ScenarioStrategyRow['id'], string> = {
  ours: 'Ours',
  lp_optimum: 'Optimum',
  proportional: 'Proportional',
  static: 'Static',
};

export function buildScenarioDamageBarData(
  scenarioBlocks: ReadonlyArray<{
    scenarioName: string;
    rows: ScenarioStrategyRow[];
  }>
): ScenarioDamageBarChartData {
  let maxVal = 100;
  for (const block of scenarioBlocks) {
    for (const row of block.rows) {
      if (row.finalDamage > maxVal) maxVal = row.finalDamage;
    }
  }

  const scaleMax = Math.max(200, Math.ceil((maxVal * 1.05) / 200) * 200);
  const ticks = [0, Math.round(scaleMax / 2), scaleMax];

  const blocks: ScenarioDamageChartBlock[] = scenarioBlocks.map((block) => {
    const optimumRow = block.rows.find((r) => r.id === 'lp_optimum');
    const optimumDamage = optimumRow ? optimumRow.finalDamage : 0;

    return {
      scenarioName: block.scenarioName,
      optimumDamage,
      optimumRatio: scaleMax > 0 ? Math.min(1, optimumDamage / scaleMax) : 0,
      bars: block.rows.map((row) => ({
        ...row,
        shortLabel: SHORT_STRATEGY_LABELS[row.id],
        deltaVsOptimum: row.finalDamage - optimumDamage,
        widthRatio: scaleMax > 0 ? Math.min(1, Math.max(0, row.finalDamage / scaleMax)) : 0,
      })),
    };
  });

  return { scaleMax, ticks, blocks };
}

