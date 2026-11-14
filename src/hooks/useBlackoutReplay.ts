import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AGENTS,
  DEFAULT_SCENARIOS,
  summarizeScenario,
  type Scenario,
  type ScenarioSummary,
  type StepRecord,
} from '../sim';
import {
  buildLiveScenario,
  checkStepInvariants,
  type LiveInvariantChecks,
} from './replayHelpers';

export type ReplaySpeed = 1 | 2 | 4;

const SPEED_INTERVAL_MS: Record<ReplaySpeed, number> = {
  1: 420,
  2: 210,
  4: 105,
};

export interface BlackoutReplayState {
  baseScenarios: Scenario[];
  selectedScenarioName: string;
  blackoutInjectedAt: number | null;
  activeScenario: Scenario;
  summary: ScenarioSummary;
  steps: StepRecord[];
  currentStep: number;
  currentRecord: StepRecord;
  isPlaying: boolean;
  speed: ReplaySpeed;
  pulseKey: number;
  invariants: LiveInvariantChecks;
  selectScenario: (name: string) => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  seek: (step: number) => void;
  triggerBlackout: () => void;
  resetScenario: () => void;
}

export function useBlackoutReplay(): BlackoutReplayState {
  const [selectedScenarioName, setSelectedScenarioName] = useState<string>(
    DEFAULT_SCENARIOS[0].name
  );
  const [blackoutInjectedAt, setBlackoutInjectedAt] = useState<number | null>(
    null
  );
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [pulseKey, setPulseKey] = useState<number>(0);

  const baseScenario = useMemo(
    () =>
      DEFAULT_SCENARIOS.find((s) => s.name === selectedScenarioName) ??
      DEFAULT_SCENARIOS[0],
    [selectedScenarioName]
  );

  const activeScenario = useMemo(
    () => buildLiveScenario(baseScenario, blackoutInjectedAt),
    [baseScenario, blackoutInjectedAt]
  );

  const summary = useMemo(
    () => summarizeScenario(activeScenario, DEFAULT_AGENTS),
    [activeScenario]
  );

  const steps = summary.steps;
  const clampedStep = Math.min(Math.max(0, currentStep), steps.length - 1);
  const currentRecord = steps[clampedStep];

  // Detect natural blackout transition (supply dropping into shedding) during playback
  const prevStepRef = useRef<number>(clampedStep);
  useEffect(() => {
    const prevIdx = prevStepRef.current;
    prevStepRef.current = clampedStep;
    if (clampedStep > prevIdx && prevIdx >= 0 && prevIdx < steps.length) {
      const prevSupply = steps[prevIdx].supply_mw;
      const nowSupply = currentRecord.supply_mw;
      if (prevSupply >= 34 && nowSupply < 34) {
        setPulseKey((k) => k + 1);
      }
    }
  }, [clampedStep, currentRecord.supply_mw, steps]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, SPEED_INTERVAL_MS[speed]);

    return () => window.clearInterval(timer);
  }, [isPlaying, speed, steps.length]);

  const selectScenario = useCallback((name: string) => {
    setSelectedScenarioName(name);
    setBlackoutInjectedAt(null);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && clampedStep >= steps.length - 1) {
        setCurrentStep(0);
      }
      return !prev;
    });
  }, [clampedStep, steps.length]);

  const seek = useCallback(
    (step: number) => {
      const next = Math.min(Math.max(0, Math.round(step)), steps.length - 1);
      setCurrentStep(next);
    },
    [steps.length]
  );

  const triggerBlackout = useCallback(() => {
    setBlackoutInjectedAt(clampedStep);
    setPulseKey((k) => k + 1);
  }, [clampedStep]);

  const resetScenario = useCallback(() => {
    setBlackoutInjectedAt(null);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const invariants = useMemo(
    () => checkStepInvariants(currentRecord, DEFAULT_AGENTS),
    [currentRecord]
  );

  return {
    baseScenarios: DEFAULT_SCENARIOS,
    selectedScenarioName,
    blackoutInjectedAt,
    activeScenario,
    summary,
    steps,
    currentStep: clampedStep,
    currentRecord,
    isPlaying,
    speed,
    pulseKey,
    invariants,
    selectScenario,
    togglePlay,
    setSpeed,
    seek,
    triggerBlackout,
    resetScenario,
  };
}
