import { useMemo } from 'react';
import { BaselineComparisonPanel } from './components/BaselineComparisonPanel';
import { CumulativeDamageChart } from './components/CumulativeDamageChart';
import { HeaderStrip } from './components/HeaderStrip';
import { HeadlineStatBanner } from './components/HeadlineStatBanner';
import { HeroSupplyChart } from './components/HeroSupplyChart';
import { NegotiationVisualizer } from './components/NegotiationVisualizer';
import { PowerFlowDiagram } from './components/PowerFlowDiagram';
import { ReportCardModal } from './components/ReportCardModal';
import { computeHeadlineStat } from './components/reportMetrics';
import { ResultsAcrossScenariosPanel } from './components/ResultsAcrossScenariosPanel';
import { useBlackoutReplay } from './hooks/useBlackoutReplay';

export default function App() {
  const replay = useBlackoutReplay();
  const { currentRecord } = replay;

  const headlineStat = useMemo(
    () => computeHeadlineStat(replay.steps, replay.currentStep),
    [replay.steps, replay.currentStep]
  );

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

      {/* Headline Stat: Top of Page Above Everything Else */}
      <HeadlineStatBanner stat={headlineStat} />

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
        onOpenReport={replay.openReport}
      />

      <main>
        {/* Simplified Hero Row: Side-by-Side Grid Supply Line & Live Agent Horizontal Bars (+ Ghost Mode) */}
        <HeroSupplyChart
          steps={replay.steps}
          currentStep={replay.currentStep}
          blackoutInjectedAt={replay.blackoutInjectedAt}
          onSeek={replay.seek}
        />

        {/* Middle Operational Grid: Left = Power Flow Diagram, Right = Negotiation Visualizer & Baseline Comparison */}
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <PowerFlowDiagram currentRecord={currentRecord} />

          <div className="px-6 py-5">
            <NegotiationVisualizer currentRecord={currentRecord} />

            <BaselineComparisonPanel
              currentRecord={currentRecord}
              summary={replay.summary}
            />
          </div>
        </div>

        {/* Collapsible Results Across Scenarios Table */}
        <ResultsAcrossScenariosPanel />

        {/* Full-Width Cumulative Damage Section Below Everything Else */}
        <CumulativeDamageChart
          steps={replay.steps}
          summary={replay.summary}
          currentStep={replay.currentStep}
          blackoutInjectedAt={replay.blackoutInjectedAt}
          onSeek={replay.seek}
        />
      </main>

      {/* End-of-Run Report Card Modal */}
      <ReportCardModal
        isOpen={replay.isReportOpen}
        summary={replay.summary}
        blackoutInjectedAt={replay.blackoutInjectedAt}
        onReplay={replay.replayFromStart}
        onClose={replay.closeReport}
      />
    </div>
  );
}
