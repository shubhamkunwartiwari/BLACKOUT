import {
  DEFAULT_AGENTS,
  DEFAULT_SCENARIOS,
  hasMinViolation,
  summarizeScenario,
  type AdversarialTestResult,
  type Agent,
  type ScenarioSummary,
  type SelfTestResult,
  type StepRecord,
} from '../sim';
import { computeGapToOptimumPct, formatSignedPct } from './baselineMetrics';

export type StrategyGrade = 'A' | 'B' | 'F';

export interface HeadlineStatResult {
  headline: string;
  gapPct: number;
  oursViolationsSoFar: number;
}

export function computeHeadlineStat(
  steps: StepRecord[],
  currentStep: number,
  agents: Agent[] = DEFAULT_AGENTS
): HeadlineStatResult {
  if (steps.length === 0) {
    return {
      headline:
        'Tracking 0.0% from the theoretical optimum, with zero safety violations',
      gapPct: 0,
      oursViolationsSoFar: 0,
    };
  }

  const clampedIdx = Math.min(Math.max(0, currentStep), steps.length - 1);
  const record = steps[clampedIdx];

  let oursViolationsSoFar = 0;
  for (let i = 0; i <= clampedIdx; i++) {
    const s = steps[i];
    if (hasMinViolation(agents, s.allocations, s.supply_mw)) {
      oursViolationsSoFar += 1;
    }
  }

  const oursDmg = record.damage_total;
  const optDmg = record.baselines.lp_optimum.damage_total;
  const gapPct = computeGapToOptimumPct(oursDmg, optDmg);

  const safetyClause =
    oursViolationsSoFar === 0
      ? 'with zero safety violations'
      : `with ${oursViolationsSoFar} safety violations`;

  return {
    headline: `Tracking ${formatSignedPct(gapPct)} from the theoretical optimum, ${safetyClause}`,
    gapPct,
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

export function formatRobustnessStat(result: SelfTestResult): string {
  return `tested across ${result.curvesTested} randomized disaster curves, ${result.failures.length} hard-constraint violations`;
}

export function formatAdversarialSummary(adv: AdversarialTestResult): string {
  const status = adv.passed ? 'PASS' : 'FAIL';
  const sign = adv.extraDamageToOthers >= 0 ? '+' : '';
  const avgSign = adv.avgExtraDamagePerScenario >= 0 ? '+' : '';
  return `${status} · lying ${adv.lyingAgentId} across ${adv.scenariosTested} curves: ${sign}${adv.extraDamageToOthers.toFixed(1)} extra dmg to others (${avgSign}${adv.avgExtraDamagePerScenario.toFixed(1)}/run), ${adv.failures.length} invariant violations`;
}
