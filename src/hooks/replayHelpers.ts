import {
  sumAllocations,
  validateAllocation,
  type Agent,
  type AgentId,
  type Scenario,
  type StepRecord,
} from '../sim';

export const BLACKOUT_DROP_MW = 30;
export const MINUTES_PER_STEP = 5;

export const AGENT_DISPLAY_ORDER: AgentId[] = [
  'hospital',
  'emergency',
  'water',
  'telecom',
];

export const AGENT_COLOR_VARS: Record<AgentId, string> = {
  hospital: 'var(--agent-hospital)',
  emergency: 'var(--agent-emergency)',
  water: 'var(--agent-water)',
  telecom: 'var(--agent-telecom)',
};

export const AGENT_LABELS: Record<AgentId, string> = {
  hospital: 'Hospital',
  emergency: 'Emergency',
  water: 'Water',
  telecom: 'Telecom',
};

/**
 * Formats timestep t (0..71, 5-minute intervals) as HH:MM elapsed time.
 */
export function formatStepTime(t: number): string {
  const totalMinutes = Math.max(0, Math.round(t)) * MINUTES_PER_STEP;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Builds the active scenario curve, optionally injecting a 30 MW blackout
 * from `blackoutAtStep` onward while preserving earlier steps verbatim.
 */
export function buildLiveScenario(
  baseScenario: Scenario,
  blackoutAtStep: number | null,
  blackoutSupplyMw: number = BLACKOUT_DROP_MW
): Scenario {
  if (
    blackoutAtStep === null ||
    blackoutAtStep < 0 ||
    blackoutAtStep >= baseScenario.supply_mw.length
  ) {
    return baseScenario;
  }

  return {
    name: `${baseScenario.name} [blackout @ t=${blackoutAtStep}]`,
    supply_mw: baseScenario.supply_mw.map((mw, idx) =>
      idx >= blackoutAtStep ? blackoutSupplyMw : mw
    ),
  };
}

export type InvariantStatus = 'safe' | 'degraded' | 'critical';

export interface LiveInvariantChecks {
  supplyCapOk: boolean;
  supplyCapStatus: InvariantStatus;
  supplyCapLabel: string;
  minFloorStatus: InvariantStatus;
  minFloorLabel: string;
}

export function checkStepInvariants(
  record: StepRecord,
  agents: Agent[]
): LiveInvariantChecks {
  const totalAlloc = sumAllocations(record.allocations);
  const supplyCapOk = totalAlloc <= record.supply_mw + 1e-6;

  let minFloorStatus: InvariantStatus = 'safe';
  let minFloorLabel = 'PASS';

  if (record.shedding) {
    const validShed = validateAllocation(
      agents,
      record.allocations,
      record.supply_mw
    ).valid;
    if (validShed) {
      minFloorStatus = 'degraded';
      minFloorLabel = 'SHEDDING';
    } else {
      minFloorStatus = 'critical';
      minFloorLabel = 'VIOLATED';
    }
  } else {
    const anyBelowMin = agents.some(
      (a) => record.allocations[a.id] < a.min_mw - 1e-6
    );
    if (anyBelowMin) {
      minFloorStatus = 'critical';
      minFloorLabel = 'VIOLATED';
    }
  }

  return {
    supplyCapOk,
    supplyCapStatus: supplyCapOk ? 'safe' : 'critical',
    supplyCapLabel: supplyCapOk ? 'PASS' : 'VIOLATED',
    minFloorStatus,
    minFloorLabel,
  };
}
