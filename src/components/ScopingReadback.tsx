import React from 'react';
import { ScopingMatrix } from './ScopingMatrix.js';
import type { ControlProfile } from '../../shared/src/schema.js';
import type { ScenarioId } from '../../shared/src/scoping-derive.js';

const LOCATION_LABELS: Record<string, string> = {
  in_country:      'in-country',
  regional_treaty: 'treaty-partner-jurisdiction',
  trusted_third:   'trusted-third-country',
  foreign:         'foreign',
  unknown:         'unknown-jurisdiction',
};

function readbackSentence(scenario: ScenarioId, profile: ControlProfile): string {
  const loc = LOCATION_LABELS[profile.L1.location] ?? 'third-party';
  switch (scenario) {
    case 'hyperscaler':
      return `Your infrastructure runs on ${loc} hyperscaler services. The provider owns and operates all layers; your team controls workloads and data only.`;
    case 'regional_csp':
      return `You use a ${loc} cloud provider who owns and operates the infrastructure. Your team controls workloads and data.`;
    case 'colocation':
      return `You rent ${loc} datacenter space. The facility is third-party; your team owns and operates the servers, platform, and operations on top.`;
    case 'own_datacenter':
      return `You own the datacenter and run everything yourself. No third party holds control over any infrastructure layer.`;
    case 'managed_service':
      return `A vendor operates your infrastructure on your behalf. You own the underlying assets; the vendor holds operational control.`;
    default:
      return `Your infrastructure spans multiple control patterns. Review the layer table to confirm each layer's ownership and operational control.`;
  }
}

interface Props {
  scenario: ScenarioId;
  profile: ControlProfile;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onEdit: () => void;
  onAdvanced: () => void;
}

export function ScopingReadback({ scenario, profile, saving, error, onConfirm, onEdit, onAdvanced }: Props) {
  const sentence = readbackSentence(scenario, profile);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Confirm your control profile</h2>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 mb-6">
        <p className="text-sm text-gray-700 leading-relaxed">{sentence}</p>
      </div>

      <p className="text-xs text-gray-400 mb-3">Cross-check the summary above against the layer grid below:</p>

      <div className="mb-6">
        <ScopingMatrix initialProfile={profile} onProfileChange={() => {}} readonly />
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-3">{error}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Confirm & start assessment →'}
        </button>
        <button onClick={onEdit} className="text-sm text-gray-500 hover:text-gray-700">
          ← Edit profile
        </button>
        <button onClick={onAdvanced} className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2">
          Advanced (layer matrix)
        </button>
      </div>
    </div>
  );
}
