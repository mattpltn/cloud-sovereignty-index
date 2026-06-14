import React, { useState } from 'react';
import { ScenarioPicker } from './ScenarioPicker.js';
import { ScopingRefineTable } from './ScopingRefineTable.js';
import { ScopingReadback } from './ScopingReadback.js';
import { ScopingMatrix } from './ScopingMatrix.js';
import {
  togglesFromDefaults,
  deriveControlProfile,
  type ScenarioId,
  type ToggleProfile,
} from '../../shared/src/scoping-derive.js';
import type { PlatformMeta } from '../../shared/src/platform-resolution.js';
import type { ControlProfile } from '../../shared/src/schema.js';

// Pre-computed per-layer count of CSI vanish questions (from data/criteria.json).
// These counts inform the user of how many questions will be added per 3p layer.
const QUESTION_COUNTS: Record<string, number> = {
  L1: 10, L2: 4, L3: 6, L4: 5, L5: 6, L6: 3,
};

const SOVEREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L3: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L4: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L5: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L6: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
};

interface Props {
  assessmentId: string;
}

type Step = 1 | 2 | 3 | 'advanced';

export function ScopingFlow({ assessmentId }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [toggleProfile, setToggleProfile] = useState<ToggleProfile | null>(null);
  const [platformMeta, setPlatformMeta] = useState<PlatformMeta>({});
  const [advancedProfile, setAdvancedProfile] = useState<ControlProfile>(SOVEREIGN_PROFILE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePickScenario(picked: ScenarioId) {
    if (picked === 'mixed') {
      setStep('advanced');
      return;
    }
    const tp = togglesFromDefaults(picked);
    setScenario(picked);
    setToggleProfile(tp);
    setStep(2);
  }

  function handleRefineBack() {
    setStep(1);
  }

  function handleRefineContinue() {
    setStep(3);
  }

  function handleReadbackEdit() {
    setStep(2);
  }

  function handleReadbackAdvanced() {
    setStep('advanced');
  }

  async function handleConfirm(profile: ControlProfile) {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        control_profile: profile,
      };
      if (scenario) body.scoping_scenario = scenario;
      if (Object.keys(platformMeta).length > 0) body.platform_meta = platformMeta;

      const res = await fetch(`/api/assessments/${assessmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save control profile');
      window.location.href = `/assess/${assessmentId}/SOV-1`;
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  async function handleAdvancedConfirm() {
    await handleConfirm(advancedProfile);
  }

  if (step === 1) {
    return (
      <ScenarioPicker onPick={handlePickScenario} />
    );
  }

  if (step === 2 && scenario && toggleProfile && scenario !== 'mixed') {
    return (
      <ScopingRefineTable
        scenario={scenario}
        toggleProfile={toggleProfile}
        platformMeta={platformMeta}
        questionCounts={QUESTION_COUNTS}
        onProfileChange={setToggleProfile}
        onPlatformMetaChange={setPlatformMeta}
        onContinue={handleRefineContinue}
        onBack={handleRefineBack}
      />
    );
  }

  if (step === 3 && scenario && toggleProfile && scenario !== 'mixed') {
    const derived = deriveControlProfile(toggleProfile);
    return (
      <ScopingReadback
        scenario={scenario}
        profile={derived}
        saving={saving}
        error={error}
        onConfirm={() => handleConfirm(derived)}
        onEdit={handleReadbackEdit}
        onAdvanced={handleReadbackAdvanced}
      />
    );
  }

  // Advanced drag-grid path
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Advanced control matrix</h2>
        <button
          onClick={() => setStep(1)}
          className="text-sm text-gray-400 hover:text-gray-700"
        >
          ← Back to scenarios
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Drag each infrastructure layer to the zone that reflects who owns and operates it.
      </p>
      <ScopingMatrix
        initialProfile={advancedProfile}
        onProfileChange={setAdvancedProfile}
      />
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleAdvancedConfirm}
          disabled={saving}
          className="bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Confirm & start assessment →'}
        </button>
        <button
          onClick={() => handleConfirm(SOVEREIGN_PROFILE)}
          disabled={saving}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
        >
          Skip — use fully sovereign defaults
        </button>
      </div>
    </div>
  );
}
