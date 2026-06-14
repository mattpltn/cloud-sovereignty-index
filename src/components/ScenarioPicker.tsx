import React from 'react';
import { SCENARIO_ONELINERS, type ScenarioId } from '../../shared/src/scoping-derive.js';

const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'hyperscaler',    label: 'Global cloud provider' },
  { id: 'regional_csp',  label: 'Local or regional cloud provider' },
  { id: 'colocation',    label: 'Our cloud in rented datacenter space' },
  { id: 'own_datacenter',label: 'Our own datacenter, self-run' },
  { id: 'managed_service',label: 'Vendor builds and/or operates our cloud' },
  { id: 'mixed',         label: 'Mixed / not sure' },
];

interface Props {
  onPick: (scenario: ScenarioId) => void;
}

export function ScenarioPicker({ onPick }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">What best describes your cloud setup?</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose the option that most closely matches your infrastructure. You'll be able to refine
        the details in the next step.
      </p>
      <div className="space-y-3">
        {SCENARIOS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPick(id)}
            className="w-full text-left border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-400 hover:bg-gray-50 transition group"
          >
            <div className="font-medium text-gray-900 group-hover:text-gray-700">{label}</div>
            <div className="text-sm text-gray-500 mt-0.5">{SCENARIO_ONELINERS[id]}</div>
            {id === 'mixed' && (
              <div className="text-xs text-gray-400 mt-1">Opens the advanced layer matrix directly.</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
