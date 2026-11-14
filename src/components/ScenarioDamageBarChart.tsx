import { useMemo, useState } from 'react';
import {
  buildScenarioDamageBarData,
  formatSignedDelta,
  type ScenarioDamageBarEntry,
  type ScenarioStrategyRow,
} from './baselineMetrics';

interface ScenarioDamageBarChartProps {
  scenarioBlocks: ReadonlyArray<{
    scenarioName: string;
    rows: ScenarioStrategyRow[];
  }>;
}

type BarChartMode = 'total' | 'delta';

export const STRATEGY_COLORS: Record<ScenarioStrategyRow['id'], string> = {
  ours: 'var(--accent-amber)',
  lp_optimum: 'var(--status-safe)',
  proportional: 'var(--text-secondary)',
  static: 'var(--status-critical)',
};

const LEGEND_ITEMS: Array<{ id: ScenarioStrategyRow['id']; label: string }> = [
  { id: 'ours', label: 'Ours' },
  { id: 'lp_optimum', label: 'Optimum' },
  { id: 'proportional', label: 'Proportional' },
  { id: 'static', label: 'Static' },
];

const SHORT_AXIS_LABELS: Record<ScenarioStrategyRow['id'], string> = {
  ours: 'OURS',
  lp_optimum: 'OPT',
  proportional: 'PROP',
  static: 'STATIC',
};

const SVG_WIDTH = 266;
const SVG_HEIGHT = 218;
const Y_AXIS_X = 36;
const PLOT_LEFT = 42;
const PLOT_RIGHT = 258;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_TOP = 38;
const PLOT_BOTTOM = 180;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const BAR_WIDTH = 34;

function getDeltaScaleMax(
  blocks: ReturnType<typeof buildScenarioDamageBarData>['blocks']
): number {
  let maxAbs = 15;
  for (const b of blocks) {
    for (const bar of b.bars) {
      const abs = Math.abs(bar.deltaVsOptimum);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  return Math.max(20, Math.ceil((maxAbs * 1.15) / 10) * 10);
}

function getTopBadge(
  bar: ScenarioDamageBarEntry,
  mode: BarChartMode
): {
  text: string;
  color: string;
} {
  if (bar.isIllegal) {
    return {
      text: 'ILLEGAL',
      color: 'var(--status-critical)',
    };
  }
  if (bar.id === 'lp_optimum') {
    return {
      text: 'BENCH',
      color: 'var(--status-safe)',
    };
  }
  if (mode === 'delta') {
    return {
      text: `${bar.finalDamage.toFixed(1)}`,
      color: 'var(--text-muted)',
    };
  }
  const signed = formatSignedDelta(bar.deltaVsOptimum);
  return {
    text: signed,
    color:
      bar.id === 'ours'
        ? 'var(--accent-amber)'
        : bar.deltaVsOptimum < -0.05
          ? 'var(--status-safe)'
          : 'var(--text-muted)',
  };
}

export function ScenarioDamageBarChart({
  scenarioBlocks,
}: ScenarioDamageBarChartProps) {
  const [mode, setMode] = useState<BarChartMode>('total');

  const chartData = useMemo(
    () => buildScenarioDamageBarData(scenarioBlocks),
    [scenarioBlocks]
  );

  const deltaMax = useMemo(
    () => getDeltaScaleMax(chartData.blocks),
    [chartData.blocks]
  );

  return (
    <div
      data-testid="scenario-damage-bar-chart"
      className="border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-2">
        <div>
          <h3 className="font-label text-[10px] font-semibold text-[var(--text-secondary)]">
            Total Damage by Strategy
          </h3>
          <div className="mt-0.5 font-data text-[10px] text-[var(--text-muted)]">
            {mode === 'total'
              ? 'LOWER IS BETTER · DASHED LINE = OPTIMUM'
              : 'DELTA VS OPTIMUM · DOWNWARD = BEATS OPT'}
          </div>
        </div>

        <div
          role="group"
          aria-label="Scenario bar chart scale"
          className="inline-flex border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
        >
          <button
            type="button"
            data-testid="scenario-barchart-mode-total"
            aria-pressed={mode === 'total'}
            onClick={() => setMode('total')}
            className={`px-2 py-0.5 font-label text-[9.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'total'
                ? 'bg-[var(--bg-control)] text-[var(--accent-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Total
          </button>
          <button
            type="button"
            data-testid="scenario-barchart-mode-delta"
            aria-pressed={mode === 'delta'}
            onClick={() => setMode('delta')}
            className={`border-l border-[var(--border-hairline)] px-2 py-0.5 font-label text-[9.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'delta'
                ? 'bg-[var(--bg-control)] text-[var(--accent-amber)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            vs Optimum
          </button>
        </div>
      </div>

      {/* Consistent strategy color legend */}
      <div
        data-testid="scenario-barchart-legend"
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-label text-[9.5px]"
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0"
              style={{ backgroundColor: STRATEGY_COLORS[item.id] }}
              aria-hidden="true"
            />
            <span
              style={{
                color:
                  item.id === 'ours'
                    ? 'var(--accent-amber)'
                    : 'var(--text-secondary)',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {chartData.blocks.map((block) => {
          const zeroY = PLOT_TOP + PLOT_HEIGHT / 2;
          const halfH = PLOT_HEIGHT / 2;
          const optY = PLOT_BOTTOM - block.optimumRatio * PLOT_HEIGHT;

          return (
            <div
              key={block.scenarioName}
              data-testid={`scenario-barchart-block-${block.scenarioName}`}
              className="border border-[var(--border-hairline)] bg-[var(--bg-surface)]/45 p-2.5"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-data text-[11px] font-semibold text-[var(--text-primary)]">
                  {block.scenarioName}
                </span>
                <span className="font-data text-[9.5px] text-[var(--text-muted)]">
                  OPT {block.optimumDamage.toFixed(1)}
                </span>
              </div>

              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="block w-full h-auto"
                role="img"
                aria-label={`${block.scenarioName} total damage bar chart across four strategies`}
              >
                <defs>
                  <pattern
                    id={`illegal-hatch-${block.scenarioName}`}
                    width="5"
                    height="5"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="5"
                      stroke="var(--bg-canvas)"
                      strokeWidth="2"
                      strokeOpacity="0.65"
                    />
                  </pattern>
                </defs>

                {/* Horizontal Y-axis gridlines & ticks */}
                {mode === 'total'
                  ? chartData.ticks.map((tick) => {
                      const y =
                        PLOT_BOTTOM - (tick / chartData.scaleMax) * PLOT_HEIGHT;
                      return (
                        <g key={`tick-${tick}`}>
                          <line
                            x1={PLOT_LEFT}
                            y1={y}
                            x2={PLOT_RIGHT}
                            y2={y}
                            stroke={
                              tick === 0
                                ? 'var(--border-strong)'
                                : 'var(--border-hairline)'
                            }
                            strokeWidth={tick === 0 ? 1 : 0.75}
                          />
                          <text
                            x={Y_AXIS_X - 4}
                            y={y + 3}
                            textAnchor="end"
                            fill="var(--text-muted)"
                            fontSize="8.5"
                            className="font-data"
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    })
                  : [-deltaMax, 0, deltaMax].map((tick) => {
                      const y = zeroY - (tick / deltaMax) * halfH;
                      return (
                        <g key={`dtick-${tick}`}>
                          <line
                            x1={PLOT_LEFT}
                            y1={y}
                            x2={PLOT_RIGHT}
                            y2={y}
                            stroke={
                              tick === 0
                                ? 'var(--status-safe)'
                                : 'var(--border-hairline)'
                            }
                            strokeWidth={tick === 0 ? 1 : 0.75}
                            strokeDasharray={tick === 0 ? '3 2.5' : undefined}
                          />
                          <text
                            x={Y_AXIS_X - 4}
                            y={y + 3}
                            textAnchor="end"
                            fill="var(--text-muted)"
                            fontSize="8.5"
                            className="font-data"
                          >
                            {tick > 0 ? `+${tick}` : tick}
                          </text>
                        </g>
                      );
                    })}

                {/* Optimum horizontal dashed reference line in Total mode */}
                {mode === 'total' && (
                  <line
                    x1={PLOT_LEFT}
                    y1={optY}
                    x2={PLOT_RIGHT}
                    y2={optY}
                    stroke="var(--status-safe)"
                    strokeWidth={1}
                    strokeDasharray="3 2.5"
                    opacity={0.8}
                  />
                )}

                {/* Vertical columns with value labels on top of each bar */}
                {block.bars.map((bar, idx) => {
                  const colStep = PLOT_WIDTH / block.bars.length;
                  const xCenter = PLOT_LEFT + colStep * (idx + 0.5);
                  const rectX = xCenter - BAR_WIDTH / 2;
                  const barColor = STRATEGY_COLORS[bar.id];
                  const topBadge = getTopBadge(bar, mode);

                  let rectY = PLOT_BOTTOM;
                  let rectH = 2;
                  let valueLabelY = PLOT_BOTTOM - 6;
                  let deltaLabelY = PLOT_BOTTOM - 17;
                  let valueText = bar.finalDamage.toFixed(1);

                  if (mode === 'total') {
                    rectH = Math.max(3, bar.widthRatio * PLOT_HEIGHT);
                    rectY = PLOT_BOTTOM - rectH;
                    valueLabelY = rectY - 5;
                    deltaLabelY = rectY - 16;
                    valueText = bar.finalDamage.toFixed(1);
                  } else {
                    const span = Math.max(
                      3,
                      Math.min(
                        halfH - 18,
                        (Math.abs(bar.deltaVsOptimum) / deltaMax) * (halfH - 18)
                      )
                    );
                    valueText =
                      bar.id === 'lp_optimum'
                        ? '0.0'
                        : formatSignedDelta(bar.deltaVsOptimum);

                    if (bar.deltaVsOptimum > 0.05) {
                      rectH = span;
                      rectY = zeroY - rectH;
                      valueLabelY = rectY - 5;
                      deltaLabelY = rectY - 16;
                    } else if (bar.deltaVsOptimum < -0.05) {
                      rectH = span;
                      rectY = zeroY;
                      valueLabelY = rectY + rectH + 11;
                      deltaLabelY = rectY + rectH + 21;
                    } else {
                      rectH = 2;
                      rectY = zeroY - 1;
                      valueLabelY = zeroY - 6;
                      deltaLabelY = zeroY - 17;
                    }
                  }

                  return (
                    <g
                      key={bar.id}
                      data-testid={`scenario-bar-${block.scenarioName}-${bar.id}`}
                    >
                      {/* Bar fill */}
                      <rect
                        x={rectX}
                        y={rectY}
                        width={BAR_WIDTH}
                        height={rectH}
                        fill={barColor}
                        fillOpacity={bar.isIllegal ? 0.65 : 0.92}
                      />

                      {/* Illegal hatch overlay (keeps consistent strategy color beneath) */}
                      {bar.isIllegal && (
                        <rect
                          x={rectX}
                          y={rectY}
                          width={BAR_WIDTH}
                          height={rectH}
                          fill={`url(#illegal-hatch-${block.scenarioName})`}
                          stroke={barColor}
                          strokeWidth={0.75}
                        />
                      )}

                      {/* Value label on top of bar */}
                      <text
                        x={xCenter}
                        y={valueLabelY}
                        textAnchor="middle"
                        data-testid={`scenario-bar-value-${block.scenarioName}-${bar.id}`}
                        fill={
                          bar.id === 'ours'
                            ? 'var(--accent-amber)'
                            : 'var(--text-primary)'
                        }
                        stroke="var(--bg-canvas)"
                        strokeWidth={3}
                        style={{ paintOrder: 'stroke' }}
                        fontSize="9.5"
                        fontWeight="600"
                        className="font-data"
                      >
                        {valueText}
                      </text>

                      {/* Delta / illegal tag stacked cleanly above value label */}
                      <text
                        x={xCenter}
                        y={deltaLabelY}
                        textAnchor="middle"
                        fill={topBadge.color}
                        fontSize="8"
                        fontWeight={
                          bar.isIllegal || bar.id === 'ours' ? '600' : '400'
                        }
                        className="font-data"
                      >
                        {topBadge.text}
                      </text>

                      {/* Bottom strategy label */}
                      <text
                        x={xCenter}
                        y={PLOT_BOTTOM + 14}
                        textAnchor="middle"
                        fill={barColor}
                        fontSize="9"
                        fontWeight={bar.id === 'ours' ? '600' : '500'}
                        className="font-label"
                      >
                        {SHORT_AXIS_LABELS[bar.id]}
                      </text>
                      {bar.isIllegal && (
                        <text
                          x={xCenter}
                          y={PLOT_BOTTOM + 25}
                          textAnchor="middle"
                          fill="var(--status-critical)"
                          fontSize="7.5"
                          fontWeight="600"
                          className="font-data"
                        >
                          {bar.minViolations}v
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
