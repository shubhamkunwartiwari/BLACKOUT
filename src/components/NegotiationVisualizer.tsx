import { useEffect, useMemo, useState } from 'react';
import {
  AGENT_COLOR_VARS,
  AGENT_DISPLAY_ORDER,
  AGENT_LABELS,
} from '../hooks/replayHelpers';
import { DEFAULT_AGENTS, type AgentId, type StepRecord } from '../sim';
import {
  parseNegotiationLog,
  type NegotiationRoundEvent,
} from './negotiationParser';

interface NegotiationVisualizerProps {
  currentRecord: StepRecord;
}

/**
 * Fixed 2x2 grid anchor positions (percentage coordinates inside the cards container)
 * matching AGENT_DISPLAY_ORDER:
 *   [0] hospital (top-left)    [1] emergency (top-right)
 *   [2] water (bottom-left)    [3] telecom (bottom-right)
 */
const CARD_ANCHOR: Record<AgentId, { x: number; y: number }> = {
  hospital: { x: 23, y: 24 },
  emergency: { x: 77, y: 24 },
  water: { x: 23, y: 76 },
  telecom: { x: 77, y: 76 },
};

function computeArrowSegment(from: AgentId, to: AgentId) {
  const a = CARD_ANCHOR[from];
  const b = CARD_ANCHOR[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const hw = 22;
  const hh = 21;
  const tEdge = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 1e-6);

  const x1 = a.x + dx * (tEdge * 1.02);
  const y1 = a.y + dy * (tEdge * 1.02);
  const x2 = b.x - dx * (tEdge * 1.08);
  const y2 = b.y - dy * (tEdge * 1.08);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return { x1, y1, x2, y2, mx, my };
}

export function NegotiationVisualizer({
  currentRecord,
}: NegotiationVisualizerProps) {
  const events = useMemo(
    () => parseNegotiationLog(currentRecord),
    [currentRecord]
  );

  const [activeRoundIdx, setActiveRoundIdx] = useState<number>(0);
  const [autoSequenceActive, setAutoSequenceActive] = useState<boolean>(true);

  // Reset sequential playback when timestep or supply changes
  useEffect(() => {
    setAutoSequenceActive(true);
    setActiveRoundIdx(0);
  }, [currentRecord.t, currentRecord.supply_mw]);

  // Sequentially step through rounds (Round 1 -> Round 2 -> ... -> settled)
  useEffect(() => {
    if (!autoSequenceActive || events.length <= 1) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setActiveRoundIdx(events.length - 1);
      setAutoSequenceActive(false);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveRoundIdx((prev) => {
        if (prev >= events.length - 1) {
          setAutoSequenceActive(false);
          return prev;
        }
        return prev + 1;
      });
    }, 520);

    return () => window.clearInterval(timer);
  }, [autoSequenceActive, events.length]);

  const safeIdx = Math.min(activeRoundIdx, Math.max(0, events.length - 1));
  const activeEvent: NegotiationRoundEvent | undefined = events[safeIdx];

  const isSettledState =
    activeEvent?.kind === 'settled' || activeEvent?.kind === 'granted';
  const isSheddingState = activeEvent?.kind === 'shedding';

  const activeConcession =
    activeEvent?.kind === 'concession' &&
    activeEvent.from &&
    activeEvent.to
      ? activeEvent
      : null;

  const arrow = activeConcession?.from && activeConcession?.to
    ? computeArrowSegment(activeConcession.from, activeConcession.to)
    : null;

  // Compact accessible trail of concession / action rounds (settled shown as calm status, not a log line)
  const actionTrail = events.filter((ev) => ev.kind !== 'settled');

  return (
    <section
      aria-labelledby="negotiation-viz-heading"
      data-testid="negotiation-visualizer"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--border-hairline)] pb-2.5">
        <h2
          id="negotiation-viz-heading"
          className="font-label text-xs font-semibold text-[var(--text-secondary)]"
        >
          Negotiation Exchange
        </h2>

        {/* Round Sequence Tabs + Calm Settled Indicator */}
        <div className="flex flex-wrap items-center gap-1.5">
          {events.map((ev, idx) => {
            const isActive = idx === safeIdx;
            const label =
              ev.kind === 'settled'
                ? '✓ settled'
                : ev.kind === 'granted'
                  ? 'R1 · ✓ settled'
                  : ev.kind === 'shedding'
                    ? 'R1 · SHED'
                    : `R${ev.round}`;

            return (
              <button
                key={`${ev.round}-${idx}`}
                type="button"
                data-testid={`negotiation-round-btn-${idx}`}
                onClick={() => {
                  setAutoSequenceActive(false);
                  setActiveRoundIdx(idx);
                }}
                aria-pressed={isActive}
                className={`border px-2 py-0.5 font-data text-[11px] transition-colors cursor-pointer ${
                  isActive
                    ? ev.kind === 'settled' || ev.kind === 'granted'
                      ? 'border-[var(--status-safe)] bg-[var(--status-safe-soft)] text-[var(--status-safe)]'
                      : ev.kind === 'shedding'
                        ? 'border-[var(--status-critical)] bg-[var(--status-critical-soft)] text-[var(--status-critical)]'
                        : 'border-[var(--accent-amber)] bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2x2 Agent Cards with Animated Concession Arrow Overlay */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          {AGENT_DISPLAY_ORDER.map((id) => {
            const agent = DEFAULT_AGENTS.find((a) => a.id === id)!;
            const alloc = currentRecord.allocations[id];
            const bid = currentRecord.bids[id];

            const isDonor = activeConcession?.from === id;
            const isRecipient = activeConcession?.to === id;

            const cardBorderClass = isDonor
              ? 'border-[var(--status-degraded)] bg-[var(--accent-amber-soft)]'
              : isRecipient
                ? 'border-[var(--status-safe)] bg-[var(--status-safe-soft)]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]';

            return (
              <div
                key={id}
                data-testid={`negotiation-card-${id}`}
                data-role={isDonor ? 'donor' : isRecipient ? 'recipient' : 'idle'}
                className={`relative border p-3 transition-colors duration-200 ${cardBorderClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0"
                      style={{ backgroundColor: AGENT_COLOR_VARS[id] }}
                      aria-hidden="true"
                    />
                    <span className="font-label text-xs font-semibold text-[var(--text-primary)] truncate">
                      {AGENT_LABELS[id]}
                    </span>
                  </div>
                  <span className="font-data text-[10px] text-[var(--text-muted)]">
                    P{agent.priority}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2 font-data text-xs">
                  <span className="text-[var(--text-muted)]">
                    BID {bid.toFixed(1)}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    ALLOC {alloc.toFixed(1)} MW
                  </span>
                </div>

                {(isDonor || isRecipient) && activeConcession && (
                  <div
                    className="mt-1.5 font-data text-[10px] font-semibold"
                    style={{
                      color: isDonor
                        ? 'var(--status-degraded)'
                        : 'var(--status-safe)',
                    }}
                  >
                    {isDonor
                      ? `CONCEDED −${activeConcession.amountMw?.toFixed(2)} MW`
                      : `RECEIVED +${activeConcession.amountMw?.toFixed(2)} MW`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SVG Arrow Overlay connecting Donor Card -> Recipient Card */}
        {arrow && activeConcession && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="negotiation-arrowhead"
                markerWidth="5"
                markerHeight="5"
                refX="4"
                refY="2.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 5 2.5, 0 5"
                  fill="var(--accent-amber)"
                />
              </marker>
            </defs>
            <line
              x1={arrow.x1}
              y1={arrow.y1}
              x2={arrow.x2}
              y2={arrow.y2}
              stroke="var(--accent-amber)"
              strokeWidth={1.6}
              markerEnd="url(#negotiation-arrowhead)"
            />
          </svg>
        )}

        {/* Crisp HTML Arrow Label Badge centered on arrow midpoint */}
        {arrow && activeConcession && (
          <div
            data-testid="negotiation-arrow-badge"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border border-[var(--accent-amber)] bg-[var(--bg-canvas)] px-2 py-0.5 font-data text-[11px] font-semibold text-[var(--accent-amber)] whitespace-nowrap"
            style={{ left: `${arrow.mx}%`, top: `${arrow.my}%` }}
          >
            R{activeConcession.round}: {activeConcession.amountMw?.toFixed(2)} MW →
          </div>
        )}
      </div>

      {/* Status Bar: Calm "✓ settled" state or active round summary */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-2.5">
        {isSettledState ? (
          <div
            data-testid="negotiation-settled-badge"
            className="inline-flex items-center gap-1.5 font-data text-xs font-semibold text-[var(--status-safe)]"
          >
            <span>
              ✓ settled
              {activeEvent?.kind === 'granted' ? ' — all bids granted' : ''}
            </span>
          </div>
        ) : isSheddingState ? (
          <div className="font-data text-xs font-semibold text-[var(--status-critical)]">
            Priority load shedding active (supply below 34 MW floor)
          </div>
        ) : activeConcession ? (
          <div className="font-data text-xs text-[var(--accent-amber)]">
            Round {activeConcession.round}: {activeConcession.from} →{' '}
            {activeConcession.to} ({activeConcession.amountMw?.toFixed(2)} MW)
          </div>
        ) : (
          <div className="font-data text-xs text-[var(--text-secondary)]">
            {activeEvent?.raw}
          </div>
        )}

        <span className="font-data text-[11px] text-[var(--text-muted)]">
          STEP {String(currentRecord.t).padStart(2, '0')} · {events.length} ROUND
          {events.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* Compact Accessible Text Trail of Recent Rounds (excluding "Allocation stable" lines) */}
      {actionTrail.length > 0 && (
        <ul
          aria-label="Recent negotiation rounds"
          className="mt-2 space-y-1 border-t border-[var(--border-hairline)] pt-2"
        >
          {actionTrail.slice(-3).map((ev, idx) => (
            <li
              key={`${ev.round}-${idx}`}
              className="font-data text-[11px] text-[var(--text-muted)]"
            >
              {ev.raw}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
