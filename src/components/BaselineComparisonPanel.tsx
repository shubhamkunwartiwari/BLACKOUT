import type { ScenarioSummary, StepRecord } from '../sim';
import { buildBaselineRows } from './baselineMetrics';

interface BaselineComparisonPanelProps {
  currentRecord: StepRecord;
  summary: ScenarioSummary;
}

export function BaselineComparisonPanel({
  currentRecord,
  summary,
}: BaselineComparisonPanelProps) {
  const rows = buildBaselineRows(currentRecord, summary);

  return (
    <div
      data-testid="baseline-comparison-panel"
      className="mt-5 border-t border-[var(--border-hairline)] pt-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-label text-xs font-semibold text-[var(--text-secondary)]">
          Baseline Comparison
        </h3>
        <span className="font-data text-[11px] text-[var(--text-muted)]">
          STEP {String(currentRecord.t).padStart(2, '0')} DMG · SCENARIO AVG JAIN
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-hairline)]">
            <th className="py-1.5 pr-3 text-left font-label text-[10px] font-medium text-[var(--text-muted)]">
              Strategy
            </th>
            <th className="py-1.5 px-3 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
              Cum. Damage
            </th>
            <th className="py-1.5 px-3 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
              Avg Jain
            </th>
            <th className="py-1.5 pl-3 text-right font-label text-[10px] font-medium text-[var(--text-muted)] whitespace-nowrap">
              MIN VIOLATIONS (FULL RUN)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => {
            const isOurs = row.id === 'ours';
            return (
              <tr
                key={row.id}
                data-testid={`baseline-row-${row.id}`}
                className={isOurs ? 'bg-[var(--bg-surface)]' : undefined}
              >
                <td className="py-2.5 pr-3 align-top">
                  <div
                    className={`font-label text-xs font-semibold ${
                      isOurs
                        ? 'text-[var(--accent-amber)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {row.label}
                  </div>
                  {row.isIllegal && (
                    <div
                      data-testid={`illegal-tag-${row.id}`}
                      className="mt-0.5 font-data text-[11px] font-medium text-[var(--status-critical)]"
                    >
                      illegal: breaks minimum loads
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right align-top font-data text-sm font-semibold text-[var(--text-primary)]">
                  {row.currentDamage.toFixed(1)}
                </td>
                <td className="py-2.5 px-3 text-right align-top font-data text-xs text-[var(--text-secondary)]">
                  {row.avgFairness.toFixed(3)}
                </td>
                <td
                  className="py-2.5 pl-3 text-right align-top font-data text-xs font-semibold"
                  style={{
                    color: row.isIllegal
                      ? 'var(--status-critical)'
                      : 'var(--status-safe)',
                  }}
                >
                  {row.minViolations}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
