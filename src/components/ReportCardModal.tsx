import { RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { ScenarioSummary } from '../sim';
import { formatSignedPct } from './baselineMetrics';
import {
  buildBaseScenarioTakeaways,
  buildReportCardRows,
  computeHeadlineStat,
  type StrategyGrade,
} from './reportMetrics';

interface ReportCardModalProps {
  isOpen: boolean;
  summary: ScenarioSummary;
  blackoutInjectedAt: number | null;
  onReplay: () => void;
  onClose: () => void;
}

const GRADE_STYLE: Record<StrategyGrade, { color: string; bg: string }> = {
  A: {
    color: 'var(--status-safe)',
    bg: 'var(--status-safe-soft)',
  },
  B: {
    color: 'var(--status-degraded)',
    bg: 'var(--status-degraded-soft)',
  },
  F: {
    color: 'var(--status-critical)',
    bg: 'var(--status-critical-soft)',
  },
};

export function ReportCardModal({
  isOpen,
  summary,
  blackoutInjectedAt,
  onReplay,
  onClose,
}: ReportCardModalProps) {
  const rows = useMemo(() => buildReportCardRows(summary), [summary]);
  const baseTakeaways = useMemo(() => buildBaseScenarioTakeaways(), []);
  const activeTakeaway = useMemo(
    () => computeHeadlineStat(summary.steps, summary.steps.length - 1),
    [summary.steps]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-card-title"
      data-testid="report-card-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-6 py-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2
              id="report-card-title"
              className="font-label text-sm font-bold tracking-[0.12em] text-[var(--text-primary)]"
            >
              End-of-Run Report Card
            </h2>
            <span className="font-data text-xs text-[var(--accent-amber)]">
              {summary.scenarioName}
            </span>
          </div>

          <button
            type="button"
            data-testid="report-close-btn"
            onClick={onClose}
            aria-label="Close report card"
            className="inline-flex h-8 w-8 items-center justify-center border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Active Run Strategy Table & Grades */}
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h3 className="font-label text-xs font-semibold text-[var(--text-secondary)]">
              Final Cumulative Damage &amp; Safety Grades
            </h3>
            <span className="font-data text-[11px] text-[var(--text-muted)]">
              A ≤ +5% OPT &amp; 0 VIOL · B = 0 VIOL · F &gt; 0 VIOL
            </span>
          </div>

          <div className="overflow-x-auto border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-hairline)]">
                  <th className="py-2.5 px-4 text-left font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Strategy
                  </th>
                  <th className="py-2.5 px-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Final Damage
                  </th>
                  <th className="py-2.5 px-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    vs Optimum
                  </th>
                  <th className="py-2.5 px-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Min Violations
                  </th>
                  <th className="py-2.5 px-4 text-center font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {rows.map((row) => {
                  const isOurs = row.id === 'ours';
                  const gradeStyle = GRADE_STYLE[row.grade];
                  return (
                    <tr
                      key={row.id}
                      data-testid={`report-row-${row.id}`}
                      className={isOurs ? 'bg-[var(--accent-amber-soft)]' : undefined}
                    >
                      <td className="py-2.5 px-4 align-middle">
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
                          <div className="mt-0.5 font-data text-[10px] text-[var(--status-critical)]">
                            illegal: breaks minimum loads
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right align-middle font-data text-sm font-semibold text-[var(--text-primary)]">
                        {row.finalDamage.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right align-middle font-data text-xs text-[var(--text-secondary)]">
                        {formatSignedPct(row.gapPct)}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right align-middle font-data text-xs font-semibold"
                        style={{
                          color: row.isIllegal
                            ? 'var(--status-critical)'
                            : 'var(--status-safe)',
                        }}
                      >
                        {row.minViolations}
                      </td>
                      <td className="py-2.5 px-4 text-center align-middle">
                        <span
                          data-testid={`report-grade-${row.id}`}
                          className="inline-block min-w-7 border px-2 py-0.5 font-data text-sm font-bold"
                          style={{
                            color: gradeStyle.color,
                            backgroundColor: gradeStyle.bg,
                            borderColor: gradeStyle.color,
                          }}
                        >
                          {row.grade}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* One-Line Takeaways per Scenario */}
          <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
            <h3 className="mb-2.5 font-label text-xs font-semibold text-[var(--text-secondary)]">
              Scenario Takeaways
            </h3>
            <div className="space-y-2 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
              {blackoutInjectedAt !== null && (
                <div
                  data-testid="report-takeaway-live"
                  className="border-b border-[var(--border-hairline)] pb-2"
                >
                  <div className="font-data text-[11px] font-semibold text-[var(--accent-amber)]">
                    {summary.scenarioName} (live run)
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--text-primary)]">
                    {activeTakeaway.headline}
                  </div>
                </div>
              )}

              {baseTakeaways.map((item, idx) => (
                <div
                  key={item.scenarioName}
                  data-testid={`report-takeaway-${item.scenarioName}`}
                  className={
                    idx > 0
                      ? 'border-t border-[var(--border-hairline)] pt-2'
                      : undefined
                  }
                >
                  <div className="font-data text-[11px] font-semibold text-[var(--text-secondary)]">
                    {item.scenarioName}
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--text-primary)]">
                    {item.takeaway.headline}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--border-hairline)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 border border-[var(--border-hairline)] bg-transparent px-4 font-label text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Dismiss
            </button>
            <button
              type="button"
              data-testid="report-replay-btn"
              onClick={onReplay}
              className="inline-flex h-9 items-center gap-2 border border-[var(--accent-amber)] bg-[var(--accent-amber-soft)] px-4 font-label text-xs font-semibold text-[var(--accent-amber)] hover:bg-[var(--accent-amber)] hover:text-[var(--bg-canvas)] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Replay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
