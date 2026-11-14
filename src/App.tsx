import { BaselineComparisonPanel } from './components/BaselineComparisonPanel';
import { CumulativeDamageChart } from './components/CumulativeDamageChart';
import { HeaderStrip } from './components/HeaderStrip';
import { HeroSupplyChart } from './components/HeroSupplyChart';
import { ResultsAcrossScenariosPanel } from './components/ResultsAcrossScenariosPanel';
import {
  AGENT_COLOR_VARS,
  AGENT_DISPLAY_ORDER,
  AGENT_LABELS,
} from './hooks/replayHelpers';
import { useBlackoutReplay } from './hooks/useBlackoutReplay';
import { DEFAULT_AGENTS } from './sim';

export default function App() {
  const replay = useBlackoutReplay();
  const { currentRecord } = replay;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* One-shot screen-edge pulse on blackout events */}
      {replay.pulseKey > 0 && (
        <div
          key={replay.pulseKey}
          className="blackout-pulse-overlay"
          aria-hidden="true"
        />
      )}

      <HeaderStrip
        scenarios={replay.baseScenarios}
        selectedScenarioName={replay.selectedScenarioName}
        blackoutInjectedAt={replay.blackoutInjectedAt}
        isPlaying={replay.isPlaying}
        speed={replay.speed}
        invariants={replay.invariants}
        onSelectScenario={replay.selectScenario}
        onTogglePlay={replay.togglePlay}
        onSetSpeed={replay.setSpeed}
        onTriggerBlackout={replay.triggerBlackout}
        onReset={replay.resetScenario}
      />

      <main>
        {/* Hero Row: Supply vs Allocated Area Chart with Scrubber */}
        <HeroSupplyChart
          steps={replay.steps}
          currentStep={replay.currentStep}
          blackoutInjectedAt={replay.blackoutInjectedAt}
          onSeek={replay.seek}
        />

        {/* Asymmetric Lower Grid: Left = Agent Panels Zone, Right = Log & Baseline Comparison */}
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left Zone: Utility Agents Frame */}
          <section
            aria-labelledby="agents-zone-heading"
            className="border-b border-[var(--border-hairline)] px-6 py-5 lg:border-b-0 lg:border-r"
          >
            <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-[var(--border-hairline)] pb-2.5">
              <h2
                id="agents-zone-heading"
                className="font-label text-xs font-semibold text-[var(--text-secondary)]"
              >
                Utility Agents — Live Allocation
              </h2>
              <span className="font-data text-xs text-[var(--text-muted)]">
                4 NODES · PRIORITY ORDERED
              </span>
            </div>

            <div className="divide-y divide-[var(--border-hairline)]">
              {AGENT_DISPLAY_ORDER.map((id) => {
                const agent = DEFAULT_AGENTS.find((a) => a.id === id)!;
                const alloc = currentRecord.allocations[id];
                const bid = currentRecord.bids[id];
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-3 w-3 shrink-0"
                        style={{ backgroundColor: AGENT_COLOR_VARS[id] }}
                        aria-hidden="true"
                      />
                      <span className="font-label text-xs font-semibold text-[var(--text-primary)]">
                        {AGENT_LABELS[id]}
                      </span>
                      <span className="font-data text-xs text-[var(--text-muted)]">
                        P{agent.priority}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-6 font-data text-xs">
                      <span className="text-[var(--text-muted)]">
                        BID {bid.toFixed(1)} MW
                      </span>
                      <span className="text-[var(--text-muted)]">
                        MIN {agent.min_mw} MW
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {alloc.toFixed(1)} / {agent.demand_mw} MW
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right Zone: Negotiation Log + Baseline Comparison Panel */}
          <section
            aria-labelledby="right-zone-heading"
            className="px-6 py-5"
          >
            <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-[var(--border-hairline)] pb-2.5">
              <h2
                id="right-zone-heading"
                className="font-label text-xs font-semibold text-[var(--text-secondary)]"
              >
                Step Telemetry &amp; Negotiation Feed
              </h2>
              <span className="font-data text-xs text-[var(--text-muted)]">
                JAIN {currentRecord.fairness_jain.toFixed(3)} · CUM DMG{' '}
                {currentRecord.damage_total.toFixed(1)}
              </span>
            </div>

            <div className="space-y-2">
              {currentRecord.log.map((entry, idx) => (
                <div
                  key={`${currentRecord.t}-${idx}`}
                  className="border-b border-[var(--border-hairline)] pb-2 font-data text-xs text-[var(--text-secondary)]"
                >
                  {entry}
                </div>
              ))}
            </div>

            <BaselineComparisonPanel
              currentRecord={currentRecord}
              summary={replay.summary}
            />
          </section>
        </div>

        {/* Bottom Full-Width Row: Cumulative Damage Line Chart */}
        <CumulativeDamageChart
          steps={replay.steps}
          summary={replay.summary}
          currentStep={replay.currentStep}
          blackoutInjectedAt={replay.blackoutInjectedAt}
          onSeek={replay.seek}
        />

        {/* Collapsible Results Across Scenarios Table */}
        <ResultsAcrossScenariosPanel />
      </main>
    </div>
  );
}
