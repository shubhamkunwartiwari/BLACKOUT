import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AGENT_COLOR_VARS,
  AGENT_DISPLAY_ORDER,
  AGENT_LABELS,
  formatStepTime,
} from '../hooks/replayHelpers';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import { DEFAULT_AGENTS, sumAllocations, type StepRecord } from '../sim';

interface HeroSupplyChartProps {
  steps: StepRecord[];
  currentStep: number;
  blackoutInjectedAt: number | null;
  onSeek: (step: number) => void;
}

const SVG_WIDTH = 640;
const SVG_HEIGHT = 228;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

const TOTAL_DEMAND_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.demand_mw, 0);
const TOTAL_MIN_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.min_mw, 0);
const MAX_AGENT_DEMAND_MW = Math.max(
  ...DEFAULT_AGENTS.map((a) => a.demand_mw)
);

export function HeroSupplyChart({
  steps,
  currentStep,
  blackoutInjectedAt,
  onSeek,
}: HeroSupplyChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const maxStep = Math.max(1, steps.length - 1);
  const currentRecord = steps[currentStep] ?? steps[0];
  const currentTotalAlloc = sumAllocations(currentRecord.allocations);
  const currentUnmet = Math.max(0, TOTAL_DEMAND_MW - currentTotalAlloc);

  const tweenedSupply = useTweenedNumber(currentRecord.supply_mw);
  const tweenedAlloc = useTweenedNumber(currentTotalAlloc);
  const tweenedUnmet = useTweenedNumber(currentUnmet);

  const maxSupply = useMemo(() => {
    const peak = Math.max(
      105,
      ...steps.map((s) => Math.max(s.supply_mw, TOTAL_DEMAND_MW))
    );
    return Math.ceil(peak / 10) * 10;
  }, [steps]);

  const xAt = useCallback(
    (t: number) => PAD_LEFT + (t / maxStep) * PLOT_WIDTH,
    [maxStep]
  );

  const yAt = useCallback(
    (mw: number) => {
      const clamped = Math.max(0, Math.min(maxSupply, mw));
      return PAD_TOP + PLOT_HEIGHT - (clamped / maxSupply) * PLOT_HEIGHT;
    },
    [maxSupply]
  );

  const supplyLineFull = useMemo(
    () =>
      steps
        .map(
          (s, idx) =>
            `${idx === 0 ? 'M' : 'L'} ${xAt(idx).toFixed(2)} ${yAt(s.supply_mw).toFixed(2)}`
        )
        .join(' '),
    [steps, xAt, yAt]
  );

  const supplyLineActive = useMemo(
    () =>
      steps
        .slice(0, currentStep + 1)
        .map(
          (s, idx) =>
            `${idx === 0 ? 'M' : 'L'} ${xAt(idx).toFixed(2)} ${yAt(s.supply_mw).toFixed(2)}`
        )
        .join(' '),
    [steps, currentStep, xAt, yAt]
  );

  const supplyAreaActive = useMemo(() => {
    const activePts = steps
      .slice(0, currentStep + 1)
      .map((s, idx) => `${xAt(idx).toFixed(2)} ${yAt(s.supply_mw).toFixed(2)}`);
    const lastX = xAt(currentStep).toFixed(2);
    const firstX = xAt(0).toFixed(2);
    const baseY = yAt(0).toFixed(2);
    return `M ${firstX} ${baseY} L ${activePts.join(' L ')} L ${lastX} ${baseY} Z`;
  }, [steps, currentStep, xAt, yAt]);

  const scrubFromPointer = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
      const plotRatio = (relX - PAD_LEFT) / PLOT_WIDTH;
      const targetStep = Math.round(
        Math.max(0, Math.min(1, plotRatio)) * maxStep
      );
      onSeek(targetStep);
    },
    [maxStep, onSeek]
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    scrubFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    scrubFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const systemState = currentRecord.shedding
    ? { label: 'LOAD SHEDDING', color: 'var(--status-critical)' }
    : currentTotalAlloc < TOTAL_DEMAND_MW - 0.05
      ? { label: 'CONSTRAINED', color: 'var(--status-degraded)' }
      : { label: 'NOMINAL', color: 'var(--status-safe)' };

  const yTicks = [0, 34, 60, 90, 100].filter((v) => v <= maxSupply);
  const xTicks = [0, 20, 40, 71];
  const playheadX = xAt(currentStep);
  const supplyY = yAt(currentRecord.supply_mw);

  return (
    <section
      aria-labelledby="hero-chart-heading"
      data-testid="hero-supply-section"
      className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-6 py-5"
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Top Numeric Telemetry Strip */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <div className="font-label text-[11px] font-medium text-[var(--text-muted)]">
                Elapsed / Step
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span
                  data-testid="hero-step-readout"
                  className="font-data text-3xl font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  {formatStepTime(currentStep)}
                </span>
                <span className="font-data text-sm text-[var(--text-secondary)]">
                  t={String(currentStep).padStart(2, '0')}/71
                </span>
              </div>
            </div>

            <div className="h-10 w-px bg-[var(--border-hairline)]" aria-hidden="true" />

            <div>
              <div className="font-label text-[11px] font-medium text-[var(--text-muted)]">
                Grid Supply
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  data-testid="hero-supply-readout"
                  className="font-data text-3xl font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  {tweenedSupply.toFixed(1)}
                </span>
                <span className="font-data text-xs text-[var(--text-muted)]">
                  MW
                </span>
              </div>
            </div>

            <div>
              <div className="font-label text-[11px] font-medium text-[var(--text-muted)]">
                Allocated Load
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  data-testid="hero-alloc-readout"
                  className="font-data text-3xl font-semibold tracking-tight text-[var(--accent-amber)]"
                >
                  {tweenedAlloc.toFixed(1)}
                </span>
                <span className="font-data text-xs text-[var(--text-muted)]">
                  MW
                </span>
              </div>
            </div>

            <div>
              <div className="font-label text-[11px] font-medium text-[var(--text-muted)]">
                Unmet Demand
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-data text-3xl font-semibold tracking-tight text-[var(--text-secondary)]">
                  {tweenedUnmet.toFixed(1)}
                </span>
                <span className="font-data text-xs text-[var(--text-muted)]">
                  MW
                </span>
              </div>
            </div>

            <div>
              <div className="font-label text-[11px] font-medium text-[var(--text-muted)]">
                Grid State
              </div>
              <div
                data-testid="hero-grid-state"
                className="mt-1 font-data text-xl font-semibold tracking-wide"
                style={{ color: systemState.color }}
              >
                {systemState.label}
              </div>
            </div>
          </div>

          <h2
            id="hero-chart-heading"
            className="font-label text-[11px] font-semibold text-[var(--text-muted)] pb-1"
          >
            Grid Supply &amp; Live Agent Load Dispatch
          </h2>
        </div>

        {/* Side-by-Side Split: Left = Grid Supply Line, Right = Live Agent Horizontal Bars */}
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left Panel: Single Line — Grid Supply (MW) over time */}
            <div className="border-b border-[var(--border-hairline)] p-4 lg:border-b-0 lg:border-r">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="font-label text-xs font-semibold text-[var(--text-secondary)]">
                  Grid Supply (MW)
                </h3>
                <span className="font-data text-[11px] text-[var(--text-muted)]">
                  SOURCE TIMELINE · 34 MW FLOOR
                </span>
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="block h-[210px] w-full cursor-crosshair select-none touch-none"
                role="img"
                aria-label="Grid supply in megawatts over 72 timesteps with 34 MW minimum floor"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Horizontal gridlines & Y-axis */}
                {yTicks.map((mw) => {
                  const y = yAt(mw);
                  const isMinFloor = mw === TOTAL_MIN_MW;
                  const isDemand = mw === TOTAL_DEMAND_MW;
                  return (
                    <g key={mw}>
                      <line
                        x1={PAD_LEFT}
                        y1={y}
                        x2={SVG_WIDTH - PAD_RIGHT}
                        y2={y}
                        stroke={
                          isMinFloor
                            ? 'var(--status-critical)'
                            : isDemand
                              ? 'var(--border-strong)'
                              : 'var(--border-hairline)'
                        }
                        strokeWidth={1}
                        strokeDasharray={isMinFloor || isDemand ? '4 4' : undefined}
                        opacity={isMinFloor ? 0.75 : 0.8}
                      />
                      <text
                        x={PAD_LEFT - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill={
                          isMinFloor
                            ? 'var(--status-critical)'
                            : 'var(--text-muted)'
                        }
                        fontSize="11"
                        className="font-data"
                      >
                        {mw}
                      </text>
                    </g>
                  );
                })}

                {/* Threshold labels */}
                <text
                  x={SVG_WIDTH - PAD_RIGHT - 4}
                  y={yAt(TOTAL_MIN_MW) - 5}
                  textAnchor="end"
                  fill="var(--status-critical)"
                  fontSize="10"
                  opacity={0.9}
                  className="font-label"
                >
                  34 MW MIN FLOOR
                </text>
                <text
                  x={SVG_WIDTH - PAD_RIGHT - 4}
                  y={yAt(TOTAL_DEMAND_MW) - 5}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize="10"
                  className="font-label"
                >
                  90 MW TOTAL DEMAND
                </text>

                {/* Subtle supply area + future/active lines */}
                <path
                  d={supplyAreaActive}
                  fill="var(--accent-amber)"
                  fillOpacity={0.12}
                />
                <path
                  d={supplyLineFull}
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <path
                  d={supplyLineActive}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth={2.5}
                />

                {/* Blackout injection marker */}
                {blackoutInjectedAt !== null && (
                  <g>
                    <line
                      x1={xAt(blackoutInjectedAt)}
                      y1={PAD_TOP}
                      x2={xAt(blackoutInjectedAt)}
                      y2={SVG_HEIGHT - PAD_BOTTOM}
                      stroke="var(--status-critical)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={Math.min(
                        SVG_WIDTH - PAD_RIGHT - 105,
                        xAt(blackoutInjectedAt) + 6
                      )}
                      y={PAD_TOP + 13}
                      fill="var(--status-critical)"
                      fontSize="10"
                      fontWeight="600"
                      className="font-data"
                    >
                      BLACKOUT @ t={blackoutInjectedAt}
                    </text>
                  </g>
                )}

                {/* Vertical playhead */}
                <line
                  x1={playheadX}
                  y1={PAD_TOP}
                  x2={playheadX}
                  y2={SVG_HEIGHT - PAD_BOTTOM}
                  stroke="var(--accent-amber)"
                  strokeWidth={1.5}
                />
                <circle
                  cx={playheadX}
                  cy={supplyY}
                  r={4.5}
                  fill="var(--accent-amber)"
                  stroke="var(--bg-canvas)"
                  strokeWidth={1.5}
                />

                {/* X-axis baseline & ticks */}
                <line
                  x1={PAD_LEFT}
                  y1={SVG_HEIGHT - PAD_BOTTOM}
                  x2={SVG_WIDTH - PAD_RIGHT}
                  y2={SVG_HEIGHT - PAD_BOTTOM}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
                {xTicks.map((tick) => {
                  const x = xAt(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={x}
                        y1={SVG_HEIGHT - PAD_BOTTOM}
                        x2={x}
                        y2={SVG_HEIGHT - PAD_BOTTOM + 4}
                        stroke="var(--border-strong)"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={SVG_HEIGHT - 8}
                        textAnchor={
                          tick === 0 ? 'start' : tick === 71 ? 'end' : 'middle'
                        }
                        fill="var(--text-muted)"
                        fontSize="11"
                        className="font-data"
                      >
                        t={tick} ({formatStepTime(tick)})
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Right Panel: Live Horizontal Bars — Agent Allocation vs Demand vs Min */}
            <div
              data-testid="hero-agent-bars"
              className="flex flex-col justify-between p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h3 className="font-label text-xs font-semibold text-[var(--text-secondary)]">
                  Allocation vs Demand by Agent
                </h3>
                <span className="font-data text-[11px] text-[var(--text-muted)]">
                  | MARKER = MIN SAFE LOAD
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-center gap-3.5">
                {AGENT_DISPLAY_ORDER.map((id) => {
                  const agent = DEFAULT_AGENTS.find((a) => a.id === id)!;
                  const alloc = currentRecord.allocations[id];
                  const demandPctOfMax = (agent.demand_mw / MAX_AGENT_DEMAND_MW) * 100;
                  const allocPctOfDemand = Math.min(
                    100,
                    Math.max(0, (alloc / agent.demand_mw) * 100)
                  );
                  const minPctOfDemand = (agent.min_mw / agent.demand_mw) * 100;

                  const isAtOrBelowMin = alloc <= agent.min_mw + 0.05;
                  const isFull = alloc >= agent.demand_mw - 0.05;
                  const statusColor = isAtOrBelowMin
                    ? 'var(--status-critical)'
                    : isFull
                      ? 'var(--status-safe)'
                      : 'var(--status-degraded)';
                  const statusText =
                    alloc < agent.min_mw - 0.05
                      ? 'SHED'
                      : isAtOrBelowMin
                        ? 'AT MIN'
                        : isFull
                          ? 'FULL'
                          : 'PARTIAL';

                  return (
                    <div
                      key={id}
                      data-testid={`hero-bar-${id}`}
                      className="grid grid-cols-[140px_1fr_140px] items-center gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0"
                          style={{ backgroundColor: AGENT_COLOR_VARS[id] }}
                          aria-hidden="true"
                        />
                        <span className="font-label text-xs font-semibold text-[var(--text-primary)] truncate">
                          {AGENT_LABELS[id]}
                        </span>
                        <span className="font-data text-[10px] text-[var(--text-muted)]">
                          P{agent.priority}
                        </span>
                      </div>

                      {/* Bar scaled against shared 30 MW max demand axis */}
                      <div className="relative h-5 w-full bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                        <div
                          className="relative h-full bg-[var(--bg-elevated)] border-r border-dashed border-[var(--border-strong)]"
                          style={{ width: `${demandPctOfMax}%` }}
                          title={`${AGENT_LABELS[id]} demand: ${agent.demand_mw} MW, min: ${agent.min_mw} MW`}
                        >
                          <div
                            className="h-full transition-[width] duration-200"
                            style={{
                              width: `${allocPctOfDemand}%`,
                              backgroundColor: AGENT_COLOR_VARS[id],
                              opacity: 0.88,
                            }}
                          />
                          {/* Minimum safe load tick */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-primary)]"
                            style={{ left: `${minPctOfDemand}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className="flex items-baseline justify-end gap-2 font-data text-xs whitespace-nowrap">
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: statusColor }}
                        >
                          {statusText}
                        </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {alloc.toFixed(1)}/{agent.demand_mw}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          M:{agent.min_mw}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Shared MW scale ticks */}
              <div className="mt-3 grid grid-cols-[140px_1fr_140px] items-center gap-3">
                <div />
                <div className="flex justify-between font-data text-[10px] text-[var(--text-muted)] border-t border-[var(--border-hairline)] pt-1">
                  <span>0 MW</span>
                  <span>10</span>
                  <span>20</span>
                  <span>30 MW</span>
                </div>
                <div />
              </div>
            </div>
          </div>

          {/* Integrated Scrubber Rail */}
          <div className="flex items-center gap-4 border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-4 py-2">
            <label
              htmlFor="timeline-scrubber"
              className="font-label text-[11px] font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0"
            >
              Scrub Step
            </label>
            <input
              id="timeline-scrubber"
              type="range"
              min={0}
              max={maxStep}
              step={1}
              value={currentStep}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="blackout-scrubber"
              aria-label="Simulation timestep scrubber"
            />
            <span className="font-data text-xs text-[var(--text-secondary)] whitespace-nowrap shrink-0">
              {String(currentStep).padStart(2, '0')} / {maxStep}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
