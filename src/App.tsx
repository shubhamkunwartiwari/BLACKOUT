import { useMemo, useState } from 'react';
import {
  DEFAULT_AGENTS,
  DEFAULT_SCENARIOS,
  runSelfTests,
  summarizeScenario,
  type SelfTestResult,
} from './sim';

export default function App() {
  const summaries = useMemo(
    () => DEFAULT_SCENARIOS.map((scenario) => summarizeScenario(scenario)),
    []
  );

  const [selectedScenarioName, setSelectedScenarioName] = useState<string>(
    DEFAULT_SCENARIOS[0].name
  );
  const [selfTestResult, setSelfTestResult] = useState<SelfTestResult | null>(
    null
  );

  const activeSummary =
    summaries.find((s) => s.scenarioName === selectedScenarioName) ??
    summaries[0];

  const handleRunSelfTest = () => {
    const result = runSelfTests(1000);
    setSelfTestResult(result);
  };

  return (
    <main className="p-4 space-y-6 font-sans text-sm">
      <h1 className="text-xl font-bold">
        Disaster Power Grid Negotiation Simulation
      </h1>

      <section aria-labelledby="agents-heading">
        <h2 id="agents-heading" className="font-semibold mb-2">
          Agents
        </h2>
        <table className="border-collapse border border-neutral-400">
          <thead>
            <tr>
              <th className="border border-neutral-400 px-2 py-1 text-left">Agent</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Demand (MW)</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Min (MW)</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Priority</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_AGENTS.map((agent) => (
              <tr key={agent.id}>
                <td className="border border-neutral-400 px-2 py-1">{agent.id}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{agent.demand_mw}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{agent.min_mw}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{agent.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="comparison-heading">
        <h2 id="comparison-heading" className="font-semibold mb-2">
          Final Total Damage Comparison (72 Steps / 6 Hours)
        </h2>
        <table className="border-collapse border border-neutral-400">
          <thead>
            <tr>
              <th className="border border-neutral-400 px-2 py-1 text-left">Scenario</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Ours (Negotiation + Arbiter)</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Static Priority</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Proportional</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Myopic Optimum (LP)</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Avg Jain Fairness (Ours)</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.scenarioName}>
                <td className="border border-neutral-400 px-2 py-1">{summary.scenarioName}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{summary.finalDamage.ours.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{summary.finalDamage.static.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{summary.finalDamage.proportional.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{summary.finalDamage.lp_optimum.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{summary.avgFairness.ours.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="selftest-heading">
        <h2 id="selftest-heading" className="font-semibold mb-2">
          Hard Constraint Self-Test
        </h2>
        <button
          type="button"
          onClick={handleRunSelfTest}
          className="border border-neutral-600 bg-neutral-100 px-3 py-1 cursor-pointer"
        >
          Run 1000 Random Supply Curve Self-Tests
        </button>
        {selfTestResult && (
          <div data-testid="self-test-output" className="mt-2">
            <p>
              <strong>Status:</strong>{' '}
              {selfTestResult.passed ? 'PASS' : 'FAIL'} (
              {selfTestResult.curvesTested} curves,{' '}
              {selfTestResult.stepsChecked} steps checked)
            </p>
            {selfTestResult.failures.length > 0 && (
              <ul>
                {selfTestResult.failures.map((failure, idx) => (
                  <li key={idx}>{failure}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-semibold mb-2">
          Per-Step Results
        </h2>
        <div className="mb-2">
          <label htmlFor="scenario-select">Scenario: </label>
          <select
            id="scenario-select"
            value={activeSummary.scenarioName}
            onChange={(e) => setSelectedScenarioName(e.target.value)}
            className="border border-neutral-500 px-2 py-1"
          >
            {summaries.map((s) => (
              <option key={s.scenarioName} value={s.scenarioName}>
                {s.scenarioName}
              </option>
            ))}
          </select>
        </div>

        <table className="border-collapse border border-neutral-400">
          <thead>
            <tr>
              <th className="border border-neutral-400 px-2 py-1 text-right">t</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Supply (MW)</th>
              <th className="border border-neutral-400 px-2 py-1 text-left">Alloc: Hospital / Water / Emerg / Telecom</th>
              <th className="border border-neutral-400 px-2 py-1 text-left">Bids: H / W / E / T</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Step Damage</th>
              <th className="border border-neutral-400 px-2 py-1 text-center">Cascade</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Total Damage (Ours)</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Static Total</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Prop Total</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">LP Opt Total</th>
              <th className="border border-neutral-400 px-2 py-1 text-right">Jain Fairness</th>
              <th className="border border-neutral-400 px-2 py-1 text-left">Negotiation Log</th>
            </tr>
          </thead>
          <tbody>
            {activeSummary.steps.map((step) => (
              <tr key={step.t}>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.t}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.supply_mw.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 whitespace-nowrap">
                  {step.allocations.hospital.toFixed(2)} /{' '}
                  {step.allocations.water.toFixed(2)} /{' '}
                  {step.allocations.emergency.toFixed(2)} /{' '}
                  {step.allocations.telecom.toFixed(2)}
                </td>
                <td className="border border-neutral-400 px-2 py-1 whitespace-nowrap">
                  {step.bids.hospital.toFixed(2)} /{' '}
                  {step.bids.water.toFixed(2)} /{' '}
                  {step.bids.emergency.toFixed(2)} /{' '}
                  {step.bids.telecom.toFixed(2)}
                </td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.damage_step_total.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-center">{step.cascade_active ? '1.5x' : '-'}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.damage_total.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.baselines.static.damage_total.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.baselines.proportional.damage_total.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.baselines.lp_optimum.damage_total.toFixed(2)}</td>
                <td className="border border-neutral-400 px-2 py-1 text-right">{step.fairness_jain.toFixed(4)}</td>
                <td className="border border-neutral-400 px-2 py-1">{step.log.join(' | ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
