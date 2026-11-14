import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DEFAULT_AGENTS,
  DEFAULT_SCENARIOS,
  summarizeScenario,
} from '../sim';
import { buildScenarioResultsRows } from './baselineMetrics';

function formatScenarioTitle(name: string): string {
  if (name === 'sudden_blackout') return 'sudden_blackout';
  if (name === 'cascade') return 'cascade';
  return name;
}

export function ResultsAcrossScenariosPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const scenarioBlocks = useMemo(() => {
    return DEFAULT_SCENARIOS.map((scenario) => {
      const summary = summarizeScenario(scenario, DEFAULT_AGENTS);
      return {
        scenarioName: summary.scenarioName,
        rows: buildScenarioResultsRows(summary),
      };
    });
  }, []);

  return (
    <section
      aria-labelledby="results-across-scenarios-heading"
      data-testid="results-across-scenarios-panel"
      className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-4"
    >
      <div className="mx-auto max-w-[1600px]">
        <button
          type="button"
          data-testid="results-across-scenarios-toggle"
          aria-expanded={isOpen}
          aria-controls="results-across-scenarios-body"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-amber)] cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            {isOpen ? (
              <ChevronDown
                className="h-4 w-4 text-[var(--accent-amber)]"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="h-4 w-4 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
            )}
            <h2
              id="results-across-scenarios-heading"
              className="font-label text-xs font-semibold text-[var(--text-primary)]"
            >
              Results across scenarios
            </h2>
            <span className="font-data text-[11px] text-[var(--text-muted)]">
              SUDDEN_BLACKOUT &amp; CASCADE · BASE SCENARIOS
            </span>
          </div>

          <span className="font-label text-[11px] font-medium text-[var(--text-secondary)]">
            {isOpen ? 'Collapse' : 'Expand table'}
          </span>
        </button>

        {isOpen && (
          <div
            id="results-across-scenarios-body"
            data-testid="results-across-scenarios-body"
            className="mt-4 overflow-x-auto border-t border-[var(--border-hairline)] pt-3"
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-hairline)]">
                  <th className="py-2 pr-4 text-left font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Scenario
                  </th>
                  <th className="py-2 px-4 text-left font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Strategy
                  </th>
                  <th className="py-2 px-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Final Damage
                  </th>
                  <th className="py-2 px-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Avg Jain
                  </th>
                  <th className="py-2 pl-4 text-right font-label text-[10px] font-medium text-[var(--text-muted)]">
                    Min Violations
                  </th>
                </tr>
              </thead>
              {scenarioBlocks.map((block, blockIdx) => (
                <tbody
                  key={block.scenarioName}
                  className={
                    blockIdx > 0
                      ? 'border-t-2 border-[var(--border-strong)] divide-y divide-[var(--border-hairline)]'
                      : 'divide-y divide-[var(--border-hairline)]'
                  }
                >
                  {block.rows.map((row, rowIdx) => {
                    const isOurs = row.id === 'ours';
                    return (
                      <tr
                        key={`${block.scenarioName}-${row.id}`}
                        data-testid={`scenario-result-row-${block.scenarioName}-${row.id}`}
                        className={isOurs ? 'bg-[var(--bg-canvas)]' : undefined}
                      >
                        {rowIdx === 0 && (
                          <td
                            rowSpan={block.rows.length}
                            className="py-2.5 pr-4 align-top font-data text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap border-r border-[var(--border-hairline)]"
                          >
                            {formatScenarioTitle(block.scenarioName)}
                          </td>
                        )}
                        <td className="py-2.5 px-4 align-top">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span
                              className={`font-label text-xs font-semibold ${
                                isOurs
                                  ? 'text-[var(--accent-amber)]'
                                  : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {row.label}
                            </span>
                            {row.isIllegal && (
                              <span
                                data-testid={`scenario-illegal-${block.scenarioName}-${row.id}`}
                                className="font-data text-[11px] font-medium text-[var(--status-critical)]"
                              >
                                illegal: breaks minimum loads
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right align-top font-data text-sm font-semibold text-[var(--text-primary)]">
                          {row.finalDamage.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-4 text-right align-top font-data text-xs text-[var(--text-secondary)]">
                          {row.avgFairness.toFixed(3)}
                        </td>
                        <td
                          className="py-2.5 pl-4 text-right align-top font-data text-xs font-semibold"
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
              ))}
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
