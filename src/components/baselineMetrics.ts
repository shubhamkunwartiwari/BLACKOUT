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
