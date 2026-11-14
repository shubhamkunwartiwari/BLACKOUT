import { useCallback, useMemo, useRef, useState } from 'react';
import { formatStepTime } from '../hooks/replayHelpers';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import type { ScenarioSummary, StepRecord } from '../sim';
import {
  computeDifferenceScale,
  computeGapToOptimumPct,
  formatSignedDelta,
  formatSignedPct,
} from './baselineMetrics';

type DamageViewMode = 'absolute' | 'difference';

interface CumulativeDamageChartProps {
  steps: StepRecord[];
  summary: ScenarioSummary;
  currentStep: number;
  blackoutInjectedAt: number | null;
  onSeek: (step: number) => void;
}

const SVG_WIDTH = 1200;
const SVG_HEIGHT = 230;
const PAD_LEFT = 54;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 30;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

interface SeriesSpec {
  id: 'ours' | 'lp_optimum' | 'proportional' | 'static';
  label: string;
  color: string;
  strokeWidth: number;
  dashArray?: string;
  getValue: (s: StepRecord) => number;
}

const SERIES: SeriesSpec[] = [
  {
    id: 'ours',
    label: 'Ours',
    color: 'var(--accent-amber)',
    strokeWidth: 2.5,
    getValue: (s) => s.damage_total,
  },
  {
    id: 'lp_optimum',
    label: 'Myopic Optimum',
    color: 'var(--status-safe)',
    strokeWidth: 2,
    dashArray: '6 3',
    getValue: (s) => s.baselines.lp_optimum.damage_total,
  },
  {
    id: 'proportional',
    label: 'Proportional',
    color: 'var(--text-secondary)',
    strokeWidth: 1.75,
    dashArray: '2 3',
    getValue: (s) => s.baselines.proportional.damage_total,
  },
  {
    id: 'static',
    label: 'Static Priority',
    color: 'var(--status-critical)',
    strokeWidth: 1.75,
    dashArray: '5 4',
    getValue: (s) => s.baselines.static.damage_total,
  },
];

export function CumulativeDamageChart({
  steps,
  summary,
  currentStep,
  blackoutInjectedAt,
  onSeek,
}: CumulativeDamageChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<DamageViewMode>('absolute');
  const [showProportional, setShowProportional] = useState(false);
  const [showStatic, setShowStatic] = useState(false);

  const visibleSeries = useMemo(() => {
    return SERIES.filter((spec) => {
      if (spec.id === 'proportional') return showProportional;
      if (spec.id === 'static') return showStatic;
      return true;
    });
  }, [showProportional, showStatic]);

  const visibleIds = useMemo(
    () => visibleSeries.map((s) => s.id),
    [visibleSeries]
  );

  const maxStep = Math.max(1, steps.length - 1);
  const currentRecord = steps[currentStep] ?? steps[0];

  const oursDmg = currentRecord.damage_total;
  const optimumDmg = currentRecord.baselines.lp_optimum.damage_total;
  const diffOursVsOpt = oursDmg - optimumDmg;
  const gapPct = computeGapToOptimumPct(oursDmg, optimumDmg);

  const tweenedOurs = useTweenedNumber(oursDmg);
  const tweenedOptimum = useTweenedNumber(optimumDmg);
  const tweenedDiff = useTweenedNumber(diffOursVsOpt);

  const maxDamage = useMemo(() => {
    let peak = 100;
    for (const step of steps) {
      for (const spec of visibleSeries) {
        peak = Math.max(peak, spec.getValue(step));
      }
    }
    return Math.ceil(peak / 200) * 200;
  }, [steps, visibleSeries]);

  const diffScale = useMemo(
    () => computeDifferenceScale(steps, visibleIds),
    [steps, visibleIds]
  );

  const yDomainMin = viewMode === 'absolute' ? 0 : diffScale.min;
  const yDomainMax = viewMode === 'absolute' ? maxDamage : diffScale.max;

  const xAt = useCallback(
    (t: number) => PAD_LEFT + (t / maxStep) * PLOT_WIDTH,
    [maxStep]
  );

  const yAt = useCallback(
    (val: number) => {
      const span = Math.max(1e-6, yDomainMax - yDomainMin);
      const clamped = Math.max(yDomainMin, Math.min(yDomainMax, val));
      return (
        PAD_TOP + PLOT_HEIGHT - ((clamped - yDomainMin) / span) * PLOT_HEIGHT
      );
    },
    [yDomainMin, yDomainMax]
  );

  const getPlotValue = useCallback(
    (spec: SeriesSpec, s: StepRecord) => {
      const raw = spec.getValue(s);
      if (viewMode === 'absolute') return raw;
      return raw - s.baselines.lp_optimum.damage_total;
    },
    [viewMode]
  );

  const seriesPaths = useMemo(() => {
    return visibleSeries.map((spec) => {
      const fullPath = steps
        .map(
          (s, idx) =>
            `${idx === 0 ? 'M' : 'L'} ${xAt(idx).toFixed(2)} ${yAt(getPlotValue(spec, s)).toFixed(2)}`
        )
        .join(' ');
      const activePath = steps
        .slice(0, currentStep + 1)
        .map(
          (s, idx) =>
            `${idx === 0 ? 'M' : 'L'} ${xAt(idx).toFixed(2)} ${yAt(getPlotValue(spec, s)).toFixed(2)}`
        )
        .join(' ');
      const currentVal = getPlotValue(spec, currentRecord);
      return {
        ...spec,
        fullPath,
        activePath,
        currentY: yAt(currentVal),
      };
    });
  }, [visibleSeries, steps, currentStep, currentRecord, xAt, yAt, getPlotValue]);

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

  const yTicks =
    viewMode === 'absolute'
      ? [
          0,
          Math.round(maxDamage * 0.25),
          Math.round(maxDamage * 0.5),
          Math.round(maxDamage * 0.75),
          maxDamage,
        ]
      : diffScale.ticks;
  const xTicks = [0, 10, 20, 30, 40, 50, 60, 71];
  const playheadX = xAt(currentStep);

  const gapColor =
    gapPct <= 0.05 ? 'var(--status-safe)' : 'var(--status-degraded)';

  return (
    <section
      aria-labelledby="damage-chart-heading"
      data-testid="damage-chart-panel"
      className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-6 py-5"
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Header, View Mode Toggle & Gap-to-Optimum Readout */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
            <div>
              <h2
                id="damage-chart-heading"
                className="font-label text-xs font-semibold text-[var(--text-secondary)]"
              >
                {viewMode === 'absolute'
                  ? 'Cumulative Damage — Strategy Comparison'
                  : 'Damage Difference vs Myopic Optimum (Strategy − Optimum)'}
              </h2>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div className="flex items-baseline gap-2">
                <span className="font-label text-[10px] text-[var(--text-muted)]">
                  Ours
                </span>
                <span
                  data-testid="damage-ours-readout"
                  className="font-data text-lg font-semibold text-[var(--accent-amber)]"
                >
                  {tweenedOurs.toFixed(1)}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-label text-[10px] text-[var(--text-muted)]">
                  Optimum
                </span>
                <span
                  data-testid="damage-optimum-readout"
                  className="font-data text-lg font-semibold text-[var(--text-primary)]"
                >
                  {tweenedOptimum.toFixed(1)}
                </span>
              </div>

              <div className="flex items-baseline gap-2 border-l border-[var(--border-hairline)] pl-5">
                <span className="font-label text-[10px] text-[var(--text-muted)]">
                  Gap to Optimum
                </span>
                <span
                  data-testid="damage-gap-readout"
                  className="font-data text-xl font-semibold"
                  style={{ color: gapColor }}
                >
                  {formatSignedPct(gapPct)}
                </span>
                <span
                  data-testid="damage-diff-readout"
                  className="font-data text-xs text-[var(--text-secondary)]"
                >
                  ({formatSignedDelta(tweenedDiff)})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Series Legend + Baseline Checkboxes */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {SERIES.map((spec) => {
                const isOptional =
                  spec.id === 'proportional' || spec.id === 'static';
                const checked =
                  spec.id === 'proportional'
                    ? showProportional
                    : spec.id === 'static'
                      ? showStatic
                      : true;
                const hasViolations =
                  spec.id !== 'ours' && summary.minViolations[spec.id] > 0;

                const lineSwatch = (
                  <svg
                    width="18"
                    height="8"
                    viewBox="0 0 18 8"
                    aria-hidden="true"
                  >
                    <line
                      x1="0"
                      y1="4"
                      x2="18"
                      y2="4"
                      stroke={spec.color}
                      strokeWidth={spec.strokeWidth}
                      strokeDasharray={spec.dashArray}
                      opacity={checked ? 1 : 0.4}
                    />
                  </svg>
                );

                if (isOptional) {
                  return (
                    <label
                      key={spec.id}
                      className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        data-testid={`damage-toggle-${spec.id}`}
                        checked={checked}
                        onChange={(e) => {
                          if (spec.id === 'proportional') {
                            setShowProportional(e.target.checked);
                          } else {
                            setShowStatic(e.target.checked);
                          }
                        }}
                        className="h-3.5 w-3.5 accent-[var(--accent-amber)] cursor-pointer"
                      />
                      {lineSwatch}
                      <span
                        className={`font-label text-[11px] ${
                          checked
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {spec.label}
                      </span>
                      {hasViolations && (
                        <span className="font-data text-[10px] text-[var(--status-critical)]">
                          (illegal)
                        </span>
                      )}
                    </label>
                  );
                }

                return (
                  <div
                    key={spec.id}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    {lineSwatch}
                    <span className="font-label text-[11px] text-[var(--text-secondary)]">
                      {spec.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Absolute / Difference vs optimum toggle */}
            <div
              className="inline-flex h-8 border border-[var(--border-strong)] bg-[var(--bg-surface)] shrink-0"
              role="group"
              aria-label="Damage chart mode"
            >
              {(
                [
                  { id: 'absolute', label: 'Absolute' },
                  { id: 'difference', label: 'Difference vs optimum' },
                ] as const
              ).map((mode) => {
                const active = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`damage-mode-${mode.id}`}
                    aria-pressed={active}
                    onClick={() => setViewMode(mode.id)}
                    className={`px-3 font-label text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-amber)] whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Full-Width Cumulative Damage SVG Line Chart */}
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="block h-[210px] w-full cursor-crosshair select-none touch-none sm:h-[230px]"
            role="img"
            aria-label={
              viewMode === 'absolute'
                ? 'Cumulative damage line chart comparing ours against static, proportional, and myopic optimum'
                : 'Damage difference versus myopic optimum line chart showing strategy damage minus optimum damage per timestep'
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Y-axis gridlines & labels */}
            {yTicks.map((val) => {
              const y = yAt(val);
              const isZeroDiffLine = viewMode === 'difference' && val === 0;
              return (
                <g key={val}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={SVG_WIDTH - PAD_RIGHT}
                    y2={y}
                    stroke={
                      isZeroDiffLine
                        ? 'var(--status-safe)'
                        : 'var(--border-hairline)'
                    }
                    strokeWidth={isZeroDiffLine ? 1.25 : 1}
                    strokeDasharray={isZeroDiffLine ? '4 3' : undefined}
                    opacity={isZeroDiffLine ? 0.65 : 1}
                  />
                  <text
                    x={PAD_LEFT - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill={
                      isZeroDiffLine
                        ? 'var(--status-safe)'
                        : 'var(--text-muted)'
                    }
                    fontSize="11"
                    className="font-data"
                  >
                    {viewMode === 'difference' && val > 0 ? `+${val}` : val}
                  </text>
                </g>
              );
            })}

            {viewMode === 'difference' && (
              <text
                x={SVG_WIDTH - PAD_RIGHT - 6}
                y={yAt(0) - 6}
                textAnchor="end"
                fill="var(--status-safe)"
                fontSize="10"
                className="font-label"
                opacity={0.85}
              >
                0 = MYOPIC OPTIMUM (BELOW IS BETTER)
              </text>
            )}

            {/* Future horizon lines (dimmed) */}
            {seriesPaths.map((s) => (
              <path
                key={`future-${s.id}`}
                d={s.fullPath}
                fill="none"
                stroke={s.color}
                strokeWidth={s.strokeWidth}
                strokeDasharray={s.dashArray}
                opacity={0.28}
              />
            ))}

            {/* Active lines up to currentStep */}
            {seriesPaths.map((s) => (
              <path
                key={`active-${s.id}`}
                d={s.activePath}
                fill="none"
                stroke={s.color}
                strokeWidth={s.strokeWidth}
                strokeDasharray={s.dashArray}
              />
            ))}

            {/* Blackout injection vertical marker */}
            {blackoutInjectedAt !== null && (
              <line
                x1={xAt(blackoutInjectedAt)}
                y1={PAD_TOP}
                x2={xAt(blackoutInjectedAt)}
                y2={SVG_HEIGHT - PAD_BOTTOM}
                stroke="var(--status-critical)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            {/* Vertical playhead line matching hero chart */}
            <line
              x1={playheadX}
              y1={PAD_TOP}
              x2={playheadX}
              y2={SVG_HEIGHT - PAD_BOTTOM}
              stroke="var(--accent-amber)"
              strokeWidth={1.5}
            />

            {/* Active point markers on playhead */}
            {seriesPaths.map((s) => (
              <circle
                key={`dot-${s.id}`}
                cx={playheadX}
                cy={s.currentY}
                r={s.id === 'ours' ? 4.5 : 3.5}
                fill={s.color}
                stroke="var(--bg-canvas)"
                strokeWidth={1.5}
              />
            ))}

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
                    y2={SVG_HEIGHT - PAD_BOTTOM + 5}
                    stroke="var(--border-strong)"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={SVG_HEIGHT - 9}
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
      </div>
    </section>
  );
}
