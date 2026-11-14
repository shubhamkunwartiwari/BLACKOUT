export type AgentId = 'hospital' | 'water' | 'emergency' | 'telecom';

export interface Agent {
  id: AgentId;
  demand_mw: number;
  min_mw: number;
  priority: number;
}

export interface Scenario {
  name: string;
  supply_mw: number[];
}

export type AllocationMap = Record<AgentId, number>;

export interface BaselineStepResult {
  allocations: AllocationMap;
  damage_step: AllocationMap;
  damage_step_total: number;
  damage_total: number;
  fairness_jain: number;
}

export interface StepRecord {
  t: number;
  supply_mw: number;
  allocations: AllocationMap;
  bids: AllocationMap;
  damage_step: AllocationMap;
  damage_step_total: number;
  damage_total: number;
  cascade_active: boolean;
  telecom_dependency_active: boolean;
  shedding: boolean;
  fairness_jain: number;
  baselines: {
    static: BaselineStepResult;
    proportional: BaselineStepResult;
    lp_optimum: BaselineStepResult;
  };
  log: string[];
}

export interface ScenarioSummary {
  scenarioName: string;
  steps: StepRecord[];
  finalDamage: {
    ours: number;
    static: number;
    proportional: number;
    lp_optimum: number;
  };
  minViolations: {
    ours: number;
    static: number;
    proportional: number;
    lp_optimum: number;
  };
  avgFairness: {
    ours: number;
    static: number;
    proportional: number;
    lp_optimum: number;
  };
}

export interface AdversarialTestResult {
  passed: boolean;
  scenariosTested: number;
  stepsChecked: number;
  lyingAgentId: AgentId;
  extraDamageToOthers: number;
  avgExtraDamagePerScenario: number;
  failures: string[];
}

export interface SelfTestResult {
  passed: boolean;
  curvesTested: number;
  stepsChecked: number;
  failures: string[];
  adversarial: AdversarialTestResult;
}
