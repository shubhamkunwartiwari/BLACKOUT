import {
  AGENT_COLOR_VARS,
  AGENT_DISPLAY_ORDER,
  AGENT_LABELS,
} from '../hooks/replayHelpers';
import { DEFAULT_AGENTS, sumAllocations, type StepRecord } from '../sim';

interface PowerFlowDiagramProps {
  currentRecord: StepRecord;
}

const SVG_WIDTH = 680;
const SVG_HEIGHT = 278;
const LEFT_X = 24;
const LEFT_WIDTH = 132;
const RIGHT_X = 438;
const RIGHT_WIDTH = 218;
const TOP_PAD = 18;
const TOTAL_DEMAND_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.demand_mw, 0);
const NODE_GAP = 12;
const USABLE_HEIGHT = SVG_HEIGHT - TOP_PAD * 2 - NODE_GAP * 3;
const SCALE_MW_CAPACITY = 100; // consistent vertical MW scale for supply & demand blocks

export function PowerFlowDiagram({ currentRecord }: PowerFlowDiagramProps) {
  const totalAlloc = sumAllocations(currentRecord.allocations);
  const supplyMw = Math.max(0, currentRecord.supply_mw);
  const surplusMw = Math.max(0, supplyMw - totalAlloc);

  // Use same vertical pixels-per-MW for left supply node and right agent nodes
  const pxPerMw = USABLE_HEIGHT / SCALE_MW_CAPACITY;
  const supplyHeight = Math.max(12, Math.min(SCALE_MW_CAPACITY, supplyMw) * pxPerMw);
  const supplyCenterY = SVG_HEIGHT / 2;
  const supplyTopY = supplyCenterY - supplyHeight / 2;

  // Build right-side agent slots (each sized by demand_mw)
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
      ribbonPath,
      midFlowY,
    };
  });

  const surplusHeight = Math.max(0, supplyTopY + supplyHeight - leftCursorY);

  return (
    <section
      aria-labelledby="power-flow-heading"
      data-testid="power-flow-diagram"
      className="border-b border-[var(--border-hairline)] px-6 py-5 lg:border-b-0 lg:border-r"
    >
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-[var(--border-hairline)] pb-2.5">
        <h2
          id="power-flow-heading"
          className="font-label text-xs font-semibold text-[var(--text-secondary)]"
        >
          Power Flow — Supply to Utility Nodes
        </h2>
        <span className="font-data text-xs text-[var(--text-muted)]">
          STEP {String(currentRecord.t).padStart(2, '0')} · {totalAlloc.toFixed(1)} / {TOTAL_DEMAND_MW} MW SERVED
        </span>
      </div>

      <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block w-full h-auto"
          role="img"
          aria-label={`Power flow diagram from grid supply ${supplyMw.toFixed(1)} MW into hospital, emergency, water, and telecom`}
        >
          {/* Flow ribbons */}
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
              stroke="var(--accent-amber)"
              strokeWidth={1.5}
            />
            {/* Colored supply slice indicators matching outgoing ribbons */}
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
              x={LEFT_X + 10}
              y={supplyTopY - 8 < 12 ? supplyTopY + 16 : supplyTopY - 7}
              fill="var(--text-secondary)"
              fontSize="10"
              fontWeight="600"
              className="font-label"
            >
              GRID SUPPLY: {supplyMw.toFixed(1)} MW
            </text>

            {surplusMw > 0.05 && surplusHeight >= 14 && (
              <text
                x={LEFT_X + 10}
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
            const labelY = f.dstY0 + Math.max(12, Math.min(20, f.allocHeight / 2 + 4));
            const showAllocInside = f.allocHeight >= 18;
            return (
              <g key={`node-${f.id}`}>
                {/* Allocated solid block */}
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

                {/* Unmet demand dimmed/dashed remainder */}
                {f.unmetHeight > 1 && (
                  <rect
                    x={RIGHT_X}
                    y={f.unmetY0}
                    width={RIGHT_WIDTH}
                    height={f.unmetHeight}
                    fill="var(--bg-canvas)"
                    fillOpacity={0.65}
                    stroke="var(--text-muted)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                )}

                {/* Node label */}
                <text
                  x={RIGHT_X + 10}
                  y={showAllocInside ? labelY : f.dstY0 + 12}
                  fill="var(--text-primary)"
                  fontSize="10.5"
                  fontWeight="600"
                  className="font-label"
                >
                  {AGENT_LABELS[f.id]}
                </text>
                <text
                  x={RIGHT_X + RIGHT_WIDTH - 10}
                  y={showAllocInside ? labelY : f.dstY0 + 12}
                  textAnchor="end"
                  fill="var(--text-primary)"
                  fontSize="11"
                  fontWeight="600"
                  className="font-data"
                >
                  {f.alloc.toFixed(1)}/{f.agent.demand_mw} MW
                </text>

                {f.unmet > 0.05 && f.unmetHeight >= 14 && (
                  <text
                    x={RIGHT_X + RIGHT_WIDTH - 10}
                    y={
                      showAllocInside
                        ? f.unmetY0 + f.unmetHeight / 2 + 3.5
                        : f.unmetY0 + f.unmetHeight - 6
                    }
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="9.5"
                    className="font-data"
                  >
                    −{f.unmet.toFixed(1)} MW UNMET
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Step Fairness & Cascade Telemetry Footer */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border-hairline)] border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
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
            {currentRecord.cascade_active ? 'ACTIVE (1.5× + PENALTY)' : 'INACTIVE'}
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
