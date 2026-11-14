import {
  DEFAULT_AGENTS,
  DEFAULT_SCENARIOS,
  hasMinViolation,
  summarizeScenario,
  type Agent,
  type ScenarioSummary,
  type StepRecord,
} from '../sim';
import { computeGapToOptimumPct, formatSignedPct } from './baselineMetrics';

export type StrategyGrade = 'A' | 'B' | 'F';

export interface HeadlineStatResult {
  mode: 'prevented' | 'optimum_tracking';
  headline: string;
  preventedPct: number;
  gapPct: number;
  staticViolationsSoFar: number;
  oursViolationsSoFar: number;
}

export function computeHeadlineStat(
  steps: StepRecord[],
  currentStep: number,
  agents: Agent[] = DEFAULT_AGENTS
): HeadlineStatResult {
  if (steps.length === 0) {
    return {
      mode: 'optimum_tracking',
      headline:
        'Tracking 0.0% from the theoretical optimum, with zero safety violations',
      preventedPct: 0,
      gapPct: 0,
      staticViolationsSoFar: 0,
      oursViolationsSoFar: 0,
    };
  }

  const clampedIdx = Math.min(Math.max(0, currentStep), steps.length - 1);
  const record = steps[clampedIdx];

  let staticViolationsSoFar = 0;
  let oursViolationsSoFar = 0;
  for (let i = 0; i <= clampedIdx; i++) {
    const s = steps[i];
    if (
      hasMinViolation(agents, s.baselines.static.allocations, s.supply_mw)
    ) {
      staticViolationsSoFar += 1;
    }
    if (hasMinViolation(agents, s.allocations, s.supply_mw)) {
      oursViolationsSoFar += 1;
    }
  }

  const oursDmg = record.damage_total;
  const staticDmg = record.baselines.static.damage_total;
  const optDmg = record.baselines.lp_optimum.damage_total;

  const preventedPct =
    staticDmg > 1e-9 ? ((staticDmg - oursDmg) / staticDmg) * 100 : 0;
  const gapPct = computeGapToOptimumPct(oursDmg, optDmg);

  if (
    staticViolationsSoFar > 0 &&
    oursViolationsSoFar === 0 &&
    preventedPct > 0.05
  ) {
    return {
      mode: 'prevented',
      headline: `Our system has prevented ~${preventedPct.toFixed(1)}% more damage than static priority while keeping every agent above its safe minimum`,
      preventedPct,
      gapPct,
      staticViolationsSoFar,
      oursViolationsSoFar,
    };
  }

  const safetyClause =
    oursViolationsSoFar === 0
      ? 'with zero safety violations'
      : `with ${oursViolationsSoFar} safety violations`;

  return {
    mode: 'optimum_tracking',
    headline: `Tracking ${formatSignedPct(gapPct)} from the theoretical optimum, ${safetyClause}`,
    preventedPct,
    gapPct,
    staticViolationsSoFar,
    oursViolationsSoFar,
  };
}

export function computeStrategyGrade(
  finalDamage: number,
  optimumDamage: number,
  minViolations: number
): StrategyGrade {
  if (minViolations > 0) {
    return 'F';
  }
  if (optimumDamage <= 1e-9) {
    return finalDamage <= 1e-9 ? 'A' : 'B';
  }
  const relDiff = (finalDamage - optimumDamage) / optimumDamage;
  return relDiff <= 0.05 + 1e-9 ? 'A' : 'B';
}

export interface ReportCardRow {
  id: 'ours' | 'lp_optimum' | 'proportional' | 'static';
  label: string;
  finalDamage: number;
  gapPct: number;
  minViolations: number;
  grade: StrategyGrade;
  isIllegal: boolean;
}

export function buildReportCardRows(summary: ScenarioSummary): ReportCardRow[] {
  const opt = summary.finalDamage.lp_optimum;
  const specs: Array<{
    id: ReportCardRow['id'];
    label: string;
    damage: number;
    violations: number;
  }> = [
    {
      id: 'ours',
      label: 'Ours (Negotiation)',
      damage: summary.finalDamage.ours,
      violations: summary.minViolations.ours,
    },
    {
      id: 'lp_optimum',
      label: 'Myopic Optimum',
      damage: summary.finalDamage.lp_optimum,
      violations: summary.minViolations.lp_optimum,
    },
    {
      id: 'proportional',
      label: 'Proportional',
      damage: summary.finalDamage.proportional,
      violations: summary.minViolations.proportional,
    },
    {
      id: 'static',
      label: 'Static Priority',
      damage: summary.finalDamage.static,
      violations: summary.minViolations.static,
    },
  ];

  return specs.map((item) => ({
    id: item.id,
    label: item.label,
    finalDamage: item.damage,
    gapPct: computeGapToOptimumPct(item.damage, opt),
    minViolations: item.violations,
    grade: computeStrategyGrade(item.damage, opt, item.violations),
    isIllegal: item.violations > 0,
  }));
}

export interface BaseScenarioTakeaway {
  scenarioName: string;
  summary: ScenarioSummary;
  takeaway: HeadlineStatResult;
}

export function buildBaseScenarioTakeaways(): BaseScenarioTakeaway[] {
  return DEFAULT_SCENARIOS.map((scenario) => {
    const summary = summarizeScenario(scenario, DEFAULT_AGENTS);
    const takeaway = computeHeadlineStat(
      summary.steps,
      summary.steps.length - 1,
      DEFAULT_AGENTS
    );
    return {
      scenarioName: summary.scenarioName,
      summary,
      takeaway,
    };
  });
}
