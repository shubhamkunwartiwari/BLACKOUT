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

const SVG_WIDTH = 1200;
const SVG_HEIGHT = 290;
const PAD_LEFT = 54;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 32;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

const TOTAL_DEMAND_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.demand_mw, 0);
const TOTAL_MIN_MW = DEFAULT_AGENTS.reduce((acc, a) => acc + a.min_mw, 0);

function buildStackedPaths(
  steps: StepRecord[],
  startIdx: number,
  endIdx: number,
  xAt: (t: number) => number,
  yAt: (mw: number) => number
) {
  const cumulativeBottom = new Array<number>(steps.length).fill(0);

  return AGENT_DISPLAY_ORDER.map((agentId) => {
    const topPts: Array<{ x: number; y: number }> = [];
    const bottomPts: Array<{ x: number; y: number }> = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const base = cumulativeBottom[i];
      const val = steps[i].allocations[agentId];
      const top = base + val;
      cumulativeBottom[i] = top;

      const x = xAt(i);
      topPts.push({ x, y: yAt(top) });
      bottomPts.push({ x, y: yAt(base) });
    }

    const topPath = topPts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    const reversedBottom = [...bottomPts]
      .reverse()
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    const areaPath = `${topPath} ${reversedBottom} Z`;

    return {
      agentId,
      color: AGENT_COLOR_VARS[agentId],
      areaPath,
      topPath,
    };
  });
}

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

  // Tweened hero readouts for projector clarity
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

  // Active stacked area (0 .. currentStep) and full horizon preview (currentStep .. end)
  const activeBands = useMemo(
    () => buildStackedPaths(steps, 0, currentStep, xAt, yAt),
    [steps, currentStep, xAt, yAt]
  );

  const futureBands = useMemo(() => {
    if (currentStep >= steps.length - 1) return [];
    return buildStackedPaths(steps, currentStep, steps.length - 1, xAt, yAt);
  }, [steps, currentStep, xAt, yAt]);

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

  // System state label + semantic color (text + color paired)
  const systemState = currentRecord.shedding
    ? { label: 'LOAD SHEDDING', color: 'var(--status-critical)' }
    : currentTotalAlloc < TOTAL_DEMAND_MW - 0.05
      ? { label: 'CONSTRAINED', color: 'var(--status-degraded)' }
      : { label: 'NOMINAL', color: 'var(--status-safe)' };

  const yTicks = [0, 34, 60, 90, 100].filter((v) => v <= maxSupply);
  const xTicks = [0, 10, 20, 30, 40, 50, 60, 71];

  const playheadX = xAt(currentStep);
  const supplyY = yAt(currentRecord.supply_mw);
  const allocY = yAt(currentTotalAlloc);

  return (
    <section
      aria-labelledby="hero-chart-heading"
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

          {/* Fixed-Hue Agent Inline Legend */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-1">
            <h2
              id="hero-chart-heading"
              className="font-label text-[11px] font-semibold text-[var(--text-muted)]"
            >
              Supply vs Allocated
            </h2>
            {AGENT_DISPLAY_ORDER.map((id) => (
              <div key={id} className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: AGENT_COLOR_VARS[id] }}
                  aria-hidden="true"
                />
                <span className="font-label text-[11px] text-[var(--text-secondary)]">
                  {AGENT_LABELS[id]}
                </span>
                <span className="font-data text-xs font-medium text-[var(--text-primary)]">
                  {currentRecord.allocations[id].toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stacked SVG Area Chart */}
        <div className="relative border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="block h-[260px] w-full cursor-crosshair select-none touch-none sm:h-[290px]"
            role="img"
            aria-label="Supply versus allocated power stacked area chart over 72 timesteps"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Horizontal grid lines & Y-axis labels */}
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
                    opacity={isMinFloor ? 0.65 : 0.8}
                  />
                  <text
                    x={PAD_LEFT - 10}
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

            {/* Threshold annotations */}
            <text
              x={SVG_WIDTH - PAD_RIGHT - 6}
              y={yAt(TOTAL_MIN_MW) - 5}
              textAnchor="end"
              fill="var(--status-critical)"
              fontSize="10"
              opacity={0.85}
              className="font-label"
            >
              34 MW MIN FLOOR
            </text>
            <text
              x={SVG_WIDTH - PAD_RIGHT - 6}
              y={yAt(TOTAL_DEMAND_MW) - 5}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="10"
              className="font-label"
            >
              90 MW TOTAL DEMAND
            </text>

            {/* Future horizon preview stacked bands (dimmed) */}
            {futureBands.map((band) => (
              <path
                key={`future-${band.agentId}`}
                d={band.areaPath}
                fill={band.color}
                fillOpacity={0.14}
              />
            ))}

            {/* Active stacked area bands up to currentStep */}
            {activeBands.map((band) => (
              <g key={`active-${band.agentId}`}>
                <path
                  d={band.areaPath}
                  fill={band.color}
                  fillOpacity={0.44}
                />
                <path
                  d={band.topPath}
                  fill="none"
                  stroke={band.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.9}
                />
              </g>
            ))}

            {/* Supply ceiling curve (future dimmed + active high-contrast) */}
            <path
              d={supplyLineFull}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.65}
            />
            <path
              d={supplyLineActive}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={2.5}
            />

            {/* Injected blackout marker if triggered */}
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
                  x={Math.min(SVG_WIDTH - PAD_RIGHT - 110, xAt(blackoutInjectedAt) + 6)}
                  y={PAD_TOP + 14}
                  fill="var(--status-critical)"
                  fontSize="10"
                  fontWeight="600"
                  className="font-data"
                >
                  BLACKOUT @ t={blackoutInjectedAt}
                </text>
              </g>
            )}

            {/* Vertical playhead crosshair */}
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
              fill="var(--text-primary)"
              stroke="var(--bg-canvas)"
              strokeWidth={1.5}
            />
            <circle
              cx={playheadX}
              cy={allocY}
              r={4}
              fill="var(--accent-amber)"
              stroke="var(--bg-canvas)"
              strokeWidth={1.5}
            />

            {/* X-axis baseline & step ticks */}
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
                    y2={SVG_HEIGHT - PAD_BOTTOM + 5}
                    stroke="var(--border-strong)"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={SVG_HEIGHT - 10}
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
