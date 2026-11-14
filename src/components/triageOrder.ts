import type { Agent, AgentId, StepRecord } from '../sim';

export type TriageStatus = 'covered' | 'partial' | 'shed';

export interface TriageRow {
  id: AgentId;
  priority: number;
  minMw: number;
  receivedMw: number;
  remainingBeforeMw: number;
  remainingAfterMw: number;
  status: TriageStatus;
}

export interface TriageOrderSummary {
  supplyMw: number;
  totalMinMw: number;
  rows: TriageRow[];
}

const EPS = 1e-6;

export function formatCompactMw(value: number): string {
  const safe = Math.abs(value) < 1e-9 ? 0 : value;
  if (Math.abs(safe - Math.round(safe)) < 1e-4) {
    return String(Math.round(safe));
  }
  return safe.toFixed(1);
}

/**
 * Computes the strict priority-ordered triage allocation table for shedding steps
 * (supply < sum of all min_mw), matching computeSafeFallback priority ordering.
 */
export function computeTriageOrder(
  agents: Agent[],
  record: StepRecord
): TriageOrderSummary {
  const supplyMw = Number.isFinite(record.supply_mw)
    ? Math.max(0, record.supply_mw)
    : 0;
  const totalMinMw = agents.reduce((acc, a) => acc + a.min_mw, 0);
  const byPriority = [...agents].sort((a, b) => b.priority - a.priority);

  let remaining = supplyMw;
  const rows: TriageRow[] = byPriority.map((agent) => {
    const remainingBeforeMw = remaining;
    const receivedMw = Math.max(0, record.allocations[agent.id] ?? 0);
    const remainingAfterMw = Math.max(0, remainingBeforeMw - receivedMw);
    remaining = remainingAfterMw;

    let status: TriageStatus;
    if (receivedMw >= agent.min_mw - EPS) {
      status = 'covered';
    } else if (receivedMw > EPS) {
      status = 'partial';
    } else {
      status = 'shed';
    }

    return {
      id: agent.id,
      priority: agent.priority,
      minMw: agent.min_mw,
      receivedMw,
      remainingBeforeMw,
      remainingAfterMw,
      status,
    };
  });

  return {
    supplyMw,
    totalMinMw,
    rows,
  };
}
