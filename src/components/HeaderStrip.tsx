import { Pause, Play, RotateCcw, Zap } from 'lucide-react';
import type {
  InvariantStatus,
  LiveInvariantChecks,
} from '../hooks/replayHelpers';
import type { ReplaySpeed } from '../hooks/useBlackoutReplay';
import type { Scenario } from '../sim';

interface HeaderStripProps {
  scenarios: Scenario[];
  selectedScenarioName: string;
  blackoutInjectedAt: number | null;
  isPlaying: boolean;
  speed: ReplaySpeed;
  invariants: LiveInvariantChecks;
  onSelectScenario: (name: string) => void;
  onTogglePlay: () => void;
  onSetSpeed: (speed: ReplaySpeed) => void;
  onTriggerBlackout: () => void;
  onReset: () => void;
}

const STATUS_STYLE: Record<
  InvariantStatus,
  { color: string; prefix: string }
> = {
  safe: { color: 'var(--status-safe)', prefix: 'OK' },
  degraded: { color: 'var(--status-degraded)', prefix: 'SHED' },
  critical: { color: 'var(--status-critical)', prefix: 'ERR' },
};

function formatScenarioLabel(name: string): string {
  if (name === 'sudden_blackout') return 'Sudden Blackout';
  if (name === 'cascade') return 'Cascade Decline';
  return name;
}

export function HeaderStrip({
  scenarios,
  selectedScenarioName,
  blackoutInjectedAt,
  isPlaying,
  speed,
  invariants,
  onSelectScenario,
  onTogglePlay,
  onSetSpeed,
  onTriggerBlackout,
  onReset,
}: HeaderStripProps) {
  const capStyle = STATUS_STYLE[invariants.supplyCapStatus];
  const minStyle = STATUS_STYLE[invariants.minFloorStatus];

  return (
    <header className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-2.5">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2.5 xl:flex-nowrap">
        {/* Brand + Live Invariant Checks */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
          <h1 className="font-label text-base font-bold tracking-[0.16em] text-[var(--text-primary)] whitespace-nowrap shrink-0">
            BLACKOUT
          </h1>

          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-[var(--border-hairline)] pl-4 xl:flex-nowrap"
            aria-label="Live Arbiter Invariant Checks"
          >
            <div
              data-testid="invariant-supply-cap"
              data-status={invariants.supplyCapStatus}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="font-data text-xs text-[var(--text-secondary)]">
                Σ allocation ≤ supply
              </span>
              <span
                className="font-data text-xs font-semibold tracking-wider"
                style={{ color: capStyle.color }}
              >
                [{invariants.supplyCapLabel}]
              </span>
            </div>

            <div
              data-testid="invariant-min-floor"
              data-status={invariants.minFloorStatus}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="font-data text-xs text-[var(--text-secondary)]">
                all agents ≥ minimum
              </span>
              <span
                className="font-data text-xs font-semibold tracking-wider"
                style={{ color: minStyle.color }}
              >
                [{invariants.minFloorLabel}]
              </span>
            </div>
          </div>
        </div>

        {/* Transport & Blackout Controls */}
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <select
            id="scenario-selector"
            aria-label="Scenario"
            value={selectedScenarioName}
            onChange={(e) => onSelectScenario(e.target.value)}
            className="h-9 border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-2.5 font-data text-xs text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-amber)] shrink-0"
          >
            {scenarios.map((scenario) => (
              <option key={scenario.name} value={scenario.name}>
                {formatScenarioLabel(scenario.name)}
              </option>
            ))}
          </select>

          <div className="h-5 w-px bg-[var(--border-hairline)] shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={onTogglePlay}
            className="inline-flex h-9 items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 font-label text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-amber)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Play</span>
              </>
            )}
          </button>

          <div
            className="inline-flex h-9 border border-[var(--border-strong)] bg-[var(--bg-canvas)] shrink-0"
            role="group"
            aria-label="Replay speed"
          >
            {([1, 2, 4] as ReplaySpeed[]).map((spd) => {
              const active = speed === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onSetSpeed(spd)}
                  aria-pressed={active}
                  className={`px-2.5 font-data text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-amber)] whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onReset}
            title="Reset replay to t=0"
            className="inline-flex h-9 items-center gap-1.5 border border-[var(--border-hairline)] bg-transparent px-3 font-label text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-amber)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onTriggerBlackout}
            className="inline-flex h-9 items-center gap-1.5 border border-[var(--status-critical)] bg-[var(--status-critical-soft)] px-3.5 font-label text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--status-critical)] hover:text-[var(--bg-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-critical)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {blackoutInjectedAt !== null
                ? `Blackout @ t=${blackoutInjectedAt}`
                : 'Trigger blackout'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
