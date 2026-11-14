import type { AgentId, StepRecord } from '../sim';

export type NegotiationRoundKind =
  | 'concession'
  | 'settled'
  | 'granted'
  | 'shedding'
  | 'fallback';

export interface NegotiationRoundEvent {
  round: number;
  kind: NegotiationRoundKind;
  from?: AgentId;
  to?: AgentId;
  amountMw?: number;
  raw: string;
}

const VALID_AGENTS = new Set<AgentId>([
  'hospital',
  'water',
  'emergency',
  'telecom',
]);

const CONCESSION_RE =
  /^Round\s+(\d+):\s+(hospital|water|emergency|telecom)\s+\(prio\s+\d+\)\s+conceded\s+([\d.]+)\s+MW\s+to\s+(hospital|water|emergency|telecom)\s+\(prio\s+\d+\)\.?/i;

const GRANTED_RE = /^Round\s+(\d+):\s+Sum of bids/i;
const SHEDDING_RE = /^Round\s+(\d+):\s+Supply\s+\(.*<\s+minimum threshold/i;
const STABLE_RE = /^Round\s+(\d+):\s+Allocation stable/i;

export function parseNegotiationLog(
  record: Pick<StepRecord, 'log'>
): NegotiationRoundEvent[] {
  const events: NegotiationRoundEvent[] = [];

  for (let idx = 0; idx < record.log.length; idx++) {
    const raw = record.log[idx];

    const concessionMatch = raw.match(CONCESSION_RE);
    if (concessionMatch) {
      const from = concessionMatch[2].toLowerCase() as AgentId;
      const to = concessionMatch[4].toLowerCase() as AgentId;
      const amountMw = Number(concessionMatch[3]);
      if (VALID_AGENTS.has(from) && VALID_AGENTS.has(to)) {
        events.push({
          round: Number(concessionMatch[1]),
          kind: 'concession',
          from,
          to,
          amountMw: Number.isFinite(amountMw) ? amountMw : 0,
          raw,
        });
        continue;
      }
    }

    const stableMatch = raw.match(STABLE_RE);
    if (stableMatch) {
      events.push({
        round: Number(stableMatch[1]),
        kind: 'settled',
        raw,
      });
      continue;
    }

    const grantedMatch = raw.match(GRANTED_RE);
    if (grantedMatch) {
      events.push({
        round: Number(grantedMatch[1]),
        kind: 'granted',
        raw,
      });
      continue;
    }

    const sheddingMatch = raw.match(SHEDDING_RE);
    if (sheddingMatch) {
      events.push({
        round: Number(sheddingMatch[1]),
        kind: 'shedding',
        raw,
      });
      continue;
    }

    events.push({
      round: idx + 1,
      kind: 'fallback',
      raw,
    });
  }

  return events;
}
