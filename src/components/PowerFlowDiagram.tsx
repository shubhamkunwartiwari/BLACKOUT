import { useMemo, useState } from 'react';
import {
  AGENT_COLOR_VARS,
  AGENT_DISPLAY_ORDER,
  AGENT_LABELS,
} from '../hooks/replayHelpers';
import { DEFAULT_AGENTS, sumAllocations, type StepRecord } from '../sim';
import { parseNegotiationLog } from './negotiationParser';
import { computeTriageOrder, formatCompactMw } from './triageOrder';

interface PowerFlowDiagramProps {
  currentRecord: StepRecord;
}

const SVG_WIDTH = 830;
const FLOW_VIEWBOX_WIDTH = 522;
const SVG_HEIGHT = 286;
const LEFT_X = 16;
const LEFT_WIDTH = 118;
const RIGHT_X = 326;
const RIGHT_WIDTH = 184;
const NODE_RIGHT_EDGE = RIGHT_X + RIGHT_WIDTH;
const TOP_PAD = 24;
const TOTAL_DEMAND_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.demand_mw, 0);
const NODE_GAP = 12;
const USABLE_HEIGHT = SVG_HEIGHT - TOP_PAD - 18 - NODE_GAP * 3;
const SCALE_MW_CAPACITY = 100;

export function PowerFlowDiagram({ currentRecord }: PowerFlowDiagramProps) {
  const [showConcessions, setShowConcessions] = useState(true);
  const isShedding = currentRecord.shedding;

  const totalAlloc = sumAllocations(currentRecord.allocations);
  const supplyMw = Math.max(0, currentRecord.supply_mw);
  const surplusMw = Math.max(0, supplyMw - totalAlloc);

  const pxPerMw = USABLE_HEIGHT / SCALE_MW_CAPACITY;
  const supplyHeight = Math.max(
    12,
    Math.min(SCALE_MW_CAPACITY, supplyMw) * pxPerMw
  );
  const supplyCenterY = TOP_PAD + (SVG_HEIGHT - TOP_PAD - 18) / 2;
  const supplyTopY = supplyCenterY - supplyHeight / 2;

  let rightCursorY = TOP_PAD;
  let leftCursorY = supplyTopY;

  const flows = AGENT_DISPLAY_ORDER.map((id) => {
    const agent = DEFAULT_AGENTS.find((a) => a.id === id)!;
    const alloc = currentRecord.allocations[id];
    const unmet = Math.max(0, agent.demand_mw - alloc);

    const demandHeight = agent.demand_mw * pxPerMw;
    const allocHeight = alloc * pxPerMw;
    const unmetHeight = unmet * pxPerMw;

    const srcY0 = leftCursorY;
    const srcY1 = leftCursorY + allocHeight;
    leftCursorY = srcY1;

    const dstY0 = rightCursorY;
    const dstY1 = rightCursorY + allocHeight;
    const unmetY0 = dstY1;
    const slotCenterY = dstY0 + demandHeight / 2;
    rightCursorY += demandHeight + NODE_GAP;

    const x0 = LEFT_X + LEFT_WIDTH;
    const x1 = RIGHT_X;
    const c1 = x0 + (x1 - x0) * 0.48;
    const c2 = x0 + (x1 - x0) * 0.52;

    const ribbonPath =
      allocHeight > 0.5
        ? `M ${x0} ${srcY0.toFixed(2)} C ${c1.toFixed(2)} ${srcY0.toFixed(2)}, ${c2.toFixed(2)} ${dstY0.toFixed(2)}, ${x1} ${dstY0.toFixed(2)} L ${x1} ${dstY1.toFixed(2)} C ${c2.toFixed(2)} ${dstY1.toFixed(2)}, ${c1.toFixed(2)} ${srcY1.toFixed(2)}, ${x0} ${srcY1.toFixed(2)} Z`
        : '';

    const midFlowY = (srcY0 + srcY1 + dstY0 + dstY1) / 4;

    return {
      agent,
      id,
      alloc,
      unmet,
      demandHeight,
      allocHeight,
      unmetHeight,
      srcY0,
      srcY1,
      dstY0,
      dstY1,
      unmetY0,
      slotCenterY,
      ribbonPath,
      midFlowY,
    };
  });

  const surplusHeight = Math.max(0, supplyTopY + supplyHeight - leftCursorY);

  const triageSummary = useMemo(
    () => (isShedding ? computeTriageOrder(DEFAULT_AGENTS, currentRecord) : null),
    [isShedding, currentRecord]
  );

  // Extract step concessions ("X conceded N MW to Y") as secondary annotation overlay (negotiation mode only)
  const concessionAnnotations = useMemo(() => {
    if (isShedding) return [];

    const events = parseNegotiationLog(currentRecord).filter(
      (ev) =>
        ev.kind === 'concession' &&
        ev.from &&
        ev.to &&
        (ev.amountMw ?? 0) > 0
    );

    const flowById = new Map(flows.map((f) => [f.id, f]));
    const raw = events
      .map((ev, idx) => {
        const fromNode = flowById.get(ev.from!);
        const toNode = flowById.get(ev.to!);
        if (!fromNode || !toNode) return null;
        return {
          key: `${ev.round}-${ev.from}-${ev.to}-${idx}`,
          round: ev.round,
          fromId: ev.from!,
          toId: ev.to!,
          fromLabel: AGENT_LABELS[ev.from!],
          amountMw: ev.amountMw!,
          yFrom: fromNode.slotCenterY,
          yTo: toNode.slotCenterY,
          midY: (fromNode.slotCenterY + toNode.slotCenterY) / 2,
          laneX: NODE_RIGHT_EDGE + 12 + idx * 9,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Compute clean non-overlapping label Y positions inside the right annotation gutter
    const minSpacing = 28;
    const labelStartY = 58;
    const positioned = raw.map((item, idx) => ({
      ...item,
      labelY: Math.max(labelStartY + idx * minSpacing, item.midY),
    }));
    // Enforce monotonic separation so labels never collide
    for (let i = 1; i < positioned.length; i++) {
      if (positioned[i].labelY < positioned[i - 1].labelY + minSpacing) {
        positioned[i].labelY = positioned[i - 1].labelY + minSpacing;
      }
    }
    return positioned;
  }, [currentRecord, flows, isShedding]);

  const activeSvgWidth = isShedding ? FLOW_VIEWBOX_WIDTH : SVG_WIDTH;

  const flowSvg = (
    <svg
      viewBox={`0 0 ${activeSvgWidth} ${SVG_HEIGHT}`}
      className="block w-full h-auto"
      role="img"
      aria-label={`Power flow diagram from grid supply ${supplyMw.toFixed(1)} MW into hospital, emergency, water, and telecom`}
    >
      <defs>
        <marker
          id="concession-bracket-dot"
          markerWidth="4"
          markerHeight="4"
          refX="2"
          refY="2"
        >
          <circle cx="2" cy="2" r="1.5" fill="var(--accent-amber)" />
        </marker>
        <marker
          id="concession-bracket-arrow"
          markerWidth="5"
          markerHeight="5"
          refX="4"
          refY="2.5"
          orient="auto"
        >
          <polygon points="0 0, 5 2.5, 0 5" fill="var(--accent-amber)" />
        </marker>
      </defs>

      {/* Primary Layer: Grid -> Agent Physical Power Flow Ribbons */}
      {flows.map((f) => {
        if (!f.ribbonPath) return null;
        return (
          <g key={`ribbon-${f.id}`}>
            <path
              d={f.ribbonPath}
              fill={AGENT_COLOR_VARS[f.id]}
              fillOpacity={0.34}
              stroke={AGENT_COLOR_VARS[f.id]}
              strokeWidth={0.9}
              strokeOpacity={0.75}
            />
            {f.allocHeight >= 14 && (
              <text
                x={(LEFT_X + LEFT_WIDTH + RIGHT_X) / 2}
                y={f.midFlowY + 3.5}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="10.5"
                className="font-data"
              >
                {f.alloc.toFixed(1)} MW
              </text>
            )}
          </g>
        );
      })}

      {/* Left Supply Node */}
      <g>
        <rect
          x={LEFT_X}
          y={supplyTopY}
          width={LEFT_WIDTH}
          height={supplyHeight}
          fill="var(--bg-elevated)"
          stroke={isShedding ? 'var(--status-critical)' : 'var(--accent-amber)'}
          strokeWidth={1.5}
        />
        {flows.map((f) => (
          <rect
            key={`slice-${f.id}`}
            x={LEFT_X + LEFT_WIDTH - 5}
            y={f.srcY0}
            width={5}
            height={Math.max(0, f.srcY1 - f.srcY0)}
            fill={AGENT_COLOR_VARS[f.id]}
          />
        ))}
        {surplusHeight > 2 && (
          <rect
            x={LEFT_X + 1}
            y={leftCursorY}
            width={LEFT_WIDTH - 2}
            height={surplusHeight - 1}
            fill="var(--text-muted)"
            fillOpacity={0.14}
          />
        )}

        <text
          x={LEFT_X}
          y={supplyTopY - 8 < 14 ? supplyTopY + 16 : supplyTopY - 7}
          fill={isShedding ? 'var(--status-critical)' : 'var(--text-secondary)'}
          fontSize="10"
          fontWeight="600"
          className="font-label"
        >
          GRID SUPPLY: {supplyMw.toFixed(1)} MW
        </text>

        {surplusMw > 0.05 && surplusHeight >= 14 && (
          <text
            x={LEFT_X + 8}
            y={leftCursorY + surplusHeight / 2 + 3.5}
            fill="var(--text-muted)"
            fontSize="10"
            className="font-data"
          >
            RESERVE {surplusMw.toFixed(1)} MW
          </text>
        )}
      </g>

      {/* Right Agent Nodes: Allocated Solid + Dashed Unmet Remainder */}
      {flows.map((f) => {
        const labelY =
          f.dstY0 + Math.max(12, Math.min(20, f.allocHeight / 2 + 4));
        const showAllocInside = f.allocHeight >= 18;
        const isShedZero = isShedding && f.alloc <= 1e-6;
        return (
          <g key={`node-${f.id}`}>
            {f.allocHeight > 0.5 && (
              <rect
                x={RIGHT_X}
                y={f.dstY0}
                width={RIGHT_WIDTH}
                height={f.allocHeight}
                fill={AGENT_COLOR_VARS[f.id]}
                fillOpacity={0.26}
                stroke={AGENT_COLOR_VARS[f.id]}
                strokeWidth={1.5}
              />
            )}

            {f.unmetHeight > 1 && (
              <rect
                x={RIGHT_X}
                y={f.unmetY0}
                width={RIGHT_WIDTH}
                height={f.unmetHeight}
                fill="var(--bg-canvas)"
                fillOpacity={0.65}
                stroke={isShedZero ? 'var(--status-critical)' : 'var(--text-muted)'}
                strokeOpacity={isShedZero ? 0.65 : 1}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )}

            <text
              x={RIGHT_X + 8}
              y={showAllocInside ? labelY : f.dstY0 + 12}
              fill="var(--text-primary)"
              fontSize="10.5"
              fontWeight="600"
              className="font-label"
            >
              {AGENT_LABELS[f.id]}
            </text>
            <text
              x={RIGHT_X + RIGHT_WIDTH - 8}
              y={showAllocInside ? labelY : f.dstY0 + 12}
              textAnchor="end"
              fill={isShedZero ? 'var(--status-critical)' : 'var(--text-primary)'}
              fontSize="10.5"
              fontWeight="600"
              className="font-data"
            >
              {f.alloc.toFixed(1)}/{f.agent.demand_mw} MW
            </text>

            {f.unmet > 0.05 && f.unmetHeight >= 14 && (
              <text
                x={RIGHT_X + RIGHT_WIDTH - 8}
                y={
                  showAllocInside
                    ? f.unmetY0 + f.unmetHeight / 2 + 3.5
                    : f.unmetY0 + f.unmetHeight - 6
                }
                textAnchor="end"
                fill={isShedZero ? 'var(--status-critical)' : 'var(--text-muted)'}
                fontSize="9.5"
                className="font-data"
              >
                {isShedZero
                  ? '0 MW — SHED'
                  : `−${f.unmet.toFixed(1)} MW UNMET`}
              </text>
            )}
          </g>
        );
      })}

      {/* Secondary Overlay Layer: Negotiation Conceded Bidding Share Annotations (non-shedding only) */}
      {!isShedding && showConcessions && (
        <g data-testid="power-flow-concessions-layer">
          <text
            x={NODE_RIGHT_EDGE + 12}
            y={16}
            fill="var(--accent-amber)"
            fontSize="8.5"
            fontWeight="600"
            className="font-label"
            style={{ letterSpacing: '0.05em' }}
            opacity={0.9}
          >
            NEGOTIATION: CONCEDED BIDDING SHARE
          </text>

          {concessionAnnotations.length === 0 ? (
            <text
              x={NODE_RIGHT_EDGE + 12}
              y={36}
              fill="var(--text-muted)"
              fontSize="9.5"
              className="font-data"
            >
              No concessions this step
            </text>
          ) : (
            concessionAnnotations.map((c) => {
              const bracketStartX = NODE_RIGHT_EDGE + 4;
              const bracketPath = `M ${bracketStartX} ${c.yFrom.toFixed(1)} L ${c.laneX} ${c.yFrom.toFixed(1)} L ${c.laneX} ${c.yTo.toFixed(1)} L ${bracketStartX + 2} ${c.yTo.toFixed(1)}`;
              const labelX =
                NODE_RIGHT_EDGE + 18 + concessionAnnotations.length * 9;
              return (
                <g
                  key={c.key}
                  data-testid={`concession-annotation-${c.round}`}
                >
                  <path
                    d={bracketPath}
                    fill="none"
                    stroke="var(--accent-amber)"
                    strokeWidth={1.15}
                    strokeDasharray="3 2.5"
                    opacity={0.85}
                    markerStart="url(#concession-bracket-dot)"
                    markerEnd="url(#concession-bracket-arrow)"
                  />
                  <line
                    x1={c.laneX}
                    y1={c.midY}
                    x2={labelX - 4}
                    y2={c.labelY - 3}
                    stroke="var(--accent-amber)"
                    strokeWidth={0.75}
                    strokeDasharray="2 2"
                    opacity={0.55}
                  />
                  <text
                    x={labelX}
                    y={c.labelY}
                    fill="var(--accent-amber)"
                    fontSize="9.5"
                    className="font-data"
                  >
                    +{c.amountMw.toFixed(2)} MW freed by {c.fromLabel}
                  </text>
                </g>
              );
            })
          )}
        </g>
      )}
    </svg>
  );

  return (
    <section
      aria-labelledby="power-flow-heading"
      data-testid="power-flow-diagram"
      className="border-b border-[var(--border-hairline)] px-6 py-5 lg:border-b-0 lg:border-r"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-2.5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2
            id="power-flow-heading"
            className="font-label text-xs font-semibold text-[var(--text-secondary)]"
          >
            Power Flow — Supply to Utility Nodes
          </h2>
          <span className="font-data text-xs text-[var(--text-muted)]">
            STEP {String(currentRecord.t).padStart(2, '0')} ·{' '}
            {totalAlloc.toFixed(1)} / {TOTAL_DEMAND_MW} MW SERVED
          </span>
        </div>

        {isShedding ? (
          <span
            data-testid="power-flow-triage-mode-label"
            className="font-label text-[10px] font-semibold text-[var(--status-critical)] whitespace-nowrap"
          >
            TRIAGE MODE
          </span>
        ) : (
          <label className="inline-flex items-center gap-1.5 border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 cursor-pointer select-none hover:border-[var(--border-strong)]">
            <input
              type="checkbox"
              data-testid="power-flow-concessions-toggle"
              checked={showConcessions}
              onChange={(e) => setShowConcessions(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent-amber)] cursor-pointer"
            />
            <span className="font-label text-[10px] font-medium text-[var(--text-secondary)]">
              show concessions
            </span>
          </label>
        )}
      </div>

      {isShedding && triageSummary ? (
        <div className="grid grid-cols-1 border border-[var(--border-hairline)] bg-[var(--bg-surface)] sm:grid-cols-[522fr_308fr]">
          <div className="flex items-center">{flowSvg}</div>

          <aside
            aria-label="Triage order priority rationing"
            data-testid="power-flow-triage-panel"
            className="flex flex-col justify-between border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)]/40 p-3 sm:border-t-0 sm:border-l"
          >
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-label text-[10px] font-semibold text-[var(--status-critical)]">
                  TRIAGE ORDER
                </h3>
                <span className="font-data text-[10px] text-[var(--text-muted)]">
                  HIGHEST PRIO FIRST
                </span>
              </div>

              <p
                data-testid="triage-summary-line"
                className="mt-1 text-[10.5px] leading-[1.35] text-[var(--text-secondary)]"
              >
                Supply ({formatCompactMw(triageSummary.supplyMw)} MW) cannot
                cover all minimums ({formatCompactMw(triageSummary.totalMinMw)}{' '}
                MW). Rationing by priority, highest first.
              </p>
            </div>

            <ol
              data-testid="triage-order-list"
              className="mt-2 divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]"
            >
              {triageSummary.rows.map((row) => {
                const receivedText = formatCompactMw(row.receivedMw);
                const minText = formatCompactMw(row.minMw);
                const remainingText = formatCompactMw(row.remainingAfterMw);

                return (
                  <li
                    key={row.id}
                    data-testid={`triage-row-${row.id}`}
                    className="py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-data text-[10px] text-[var(--text-muted)]">
                          P{row.priority}
                        </span>
                        <span
                          className="inline-block h-2 w-2 shrink-0"
                          style={{ backgroundColor: AGENT_COLOR_VARS[row.id] }}
                          aria-hidden="true"
                        />
                        <span className="font-label text-[10px] font-semibold text-[var(--text-primary)] truncate">
                          {AGENT_LABELS[row.id]}
                        </span>
                      </div>
                      <span
                        data-testid={`triage-remaining-${row.id}`}
                        className="font-data text-[10px] text-[var(--text-secondary)] whitespace-nowrap"
                      >
                        Remaining: {remainingText} MW
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-baseline justify-between gap-2 font-data text-[10px]">
                      <span className="text-[var(--text-muted)] whitespace-nowrap">
                        Min {minText} MW
                      </span>

                      {row.status === 'covered' ? (
                        <span
                          data-testid={`triage-status-${row.id}`}
                          className="font-semibold whitespace-nowrap"
                          style={{ color: 'var(--status-safe)' }}
                        >
                          ✓ {receivedText} of {minText} MW
                        </span>
                      ) : row.status === 'partial' ? (
                        <span
                          data-testid={`triage-status-${row.id}`}
                          className="font-semibold whitespace-nowrap"
                          style={{ color: 'var(--status-degraded)' }}
                        >
                          PARTIAL: {receivedText} of {minText} MW min
                        </span>
                      ) : (
                        <span
                          data-testid={`triage-status-${row.id}`}
                          className="font-semibold whitespace-nowrap"
                          style={{ color: 'var(--status-critical)' }}
                        >
                          0 MW — SHED
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      ) : (
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          {flowSvg}
        </div>
      )}

      {/* Step Fairness & Cascade Telemetry Footer */}
      <div className="mt-4 grid grid-cols-4 divide-x divide-[var(--border-hairline)] border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="px-3.5 py-2.5">
          <div className="font-label text-[10px] text-[var(--text-muted)]">
            Jain Fairness
          </div>
          <div
            data-testid="step-jain-readout"
            className="mt-0.5 font-data text-base font-semibold text-[var(--text-primary)]"
          >
            {currentRecord.fairness_jain.toFixed(3)}
          </div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="font-label text-[10px] text-[var(--text-muted)]">
            Water Cascade
          </div>
          <div
            className="mt-0.5 font-data text-sm font-semibold"
            style={{
              color: currentRecord.cascade_active
                ? 'var(--status-critical)'
                : 'var(--status-safe)',
            }}
          >
            {currentRecord.cascade_active
              ? 'ACTIVE (1.5× + PENALTY)'
              : 'INACTIVE'}
          </div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="font-label text-[10px] text-[var(--text-muted)]">
            Telecom Dependency
          </div>
          <div
            data-testid="telecom-dependency-readout"
            className="mt-0.5 font-data text-sm font-semibold"
            style={{
              color: currentRecord.telecom_dependency_active
                ? 'var(--accent-amber)'
                : 'var(--status-safe)',
            }}
          >
            {currentRecord.telecom_dependency_active
              ? 'ACTIVE · DISPATCH DEGRADED'
              : 'INACTIVE'}
          </div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="font-label text-[10px] text-[var(--text-muted)]">
            Step Cum. Damage
          </div>
          <div className="mt-0.5 font-data text-base font-semibold text-[var(--accent-amber)]">
            {currentRecord.damage_total.toFixed(1)}
          </div>
        </div>
      </div>
    </section>
  );
}
