import React, { useState } from 'react';
import type { LayerToggles, ToggleProfile, ScenarioId, Toggle, SupportNature } from '../../shared/src/scoping-derive.js';
import { getScenarioNotes, SCENARIO_LABELS } from '../../shared/src/scoping-derive.js';
import type { PlatformLayerMeta, PlatformMeta } from '../../shared/src/platform-resolution.js';

type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

const LAYER_LABELS: Record<LayerId, { name: string; subtitle: string }> = {
  L1: { name: 'Facility',         subtitle: 'Building, power, physical security' },
  L2: { name: 'Hardware',         subtitle: 'Servers, storage, network' },
  L3: { name: 'Virtualization',   subtitle: 'IaaS fabric — hypervisor, object storage' },
  L4: { name: 'Managed / PaaS',   subtitle: 'Managed DBs, serverless, AI services' },
  L5: { name: 'Operations',       subtitle: 'Privileged access, patching, NOC/SOC' },
  L6: { name: 'Consumption',      subtitle: 'Workloads and criticality profile' },
};

const LOCATION_LABELS: Array<{ value: LayerToggles['location']; label: string }> = [
  { value: 'in_country',      label: 'In-country' },
  { value: 'regional_treaty', label: 'Treaty-partner jurisdiction' },
  { value: 'trusted_third',   label: 'Trusted third country' },
  { value: 'foreign',         label: 'Foreign jurisdiction' },
  { value: 'unknown',         label: 'Unknown' },
];

const SUPPORT_NATURE_LABELS: Array<{ value: SupportNature; label: string }> = [
  { value: 'licensed_supported',      label: 'Licensed (vendor-supported)' },
  { value: 'licensed_no_support',     label: 'Licensed (no vendor support)' },
  { value: 'proprietary_inaccessible',label: 'Proprietary / closed platform' },
];

const PLATFORM_KIND_LABELS = [
  { value: 'proprietary',        label: 'Proprietary (VMware, Nutanix, Huawei, etc.)' },
  { value: 'open_source_based',  label: 'Open-source based (OpenStack, KubeVirt, etc.)' },
  { value: 'unknown',            label: 'Unknown / not sure' },
];

const INTEROP_CONFORMANCE_LABELS = [
  { value: 'demonstrated', label: 'Demonstrated (RefStack / open-API test results)' },
  { value: 'claimed',      label: 'Claimed (no formal test results)' },
  { value: 'none',         label: 'Not conformant' },
  { value: 'unknown',      label: 'Unknown' },
];

const LAYERS: LayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border font-medium transition ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  );
}

interface LayerRowProps {
  layerId: LayerId;
  toggles: LayerToggles;
  note?: string;
  questionCount: number;
  platformMeta?: PlatformLayerMeta;
  showPlatformFacets: boolean;
  onChange: (t: LayerToggles) => void;
  onPlatformMetaChange: (m: PlatformLayerMeta) => void;
}

function LayerRow({
  layerId, toggles, note, questionCount, platformMeta = {}, showPlatformFacets,
  onChange, onPlatformMetaChange,
}: LayerRowProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const info = LAYER_LABELS[layerId];
  const hasThirdParty = toggles.owned === '3p' || toggles.operated === '3p' || toggles.supported === '3p';
  const isPlatformLayer = layerId === 'L3' || layerId === 'L4';
  const showPlatformKind = showPlatformFacets && isPlatformLayer && toggles.supported === '3p' &&
    (toggles.support_nature === 'licensed_supported' || toggles.support_nature === 'licensed_no_support');

  function set(patch: Partial<LayerToggles>) {
    const next = { ...toggles, ...patch };
    // When switching supported to client, clear support_nature
    if (patch.supported === 'client') next.support_nature = undefined;
    onChange(next);
  }

  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-start gap-3">
        {/* Layer label */}
        <div className="w-40 shrink-0">
          <div className="font-semibold text-sm text-gray-800">{layerId} — {info.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{info.subtitle}</div>
        </div>

        {/* Toggles */}
        <div className="flex-1 space-y-2">
          {/* Owned */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Owned by</span>
            <div className="flex gap-2">
              <ToggleButton active={toggles.owned === 'client'} label="Client" onClick={() => set({ owned: 'client' })} />
              <ToggleButton active={toggles.owned === '3p'} label="Third party" onClick={() => set({ owned: '3p' })} />
            </div>
          </div>

          {/* Operated */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Operated by</span>
            <div className="flex gap-2">
              <ToggleButton active={toggles.operated === 'client'} label="Client" onClick={() => set({ operated: 'client' })} />
              <ToggleButton active={toggles.operated === '3p'} label="Third party" onClick={() => set({ operated: '3p' })} />
            </div>
          </div>

          {/* Supported by */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Supported by</span>
            <div className="flex gap-2">
              <ToggleButton active={toggles.supported === 'client'} label="Client" onClick={() => set({ supported: 'client' })} />
              <ToggleButton active={toggles.supported === '3p'} label="Third party" onClick={() => set({ supported: '3p' })} />
            </div>
          </div>

          {/* Location (when any toggle is 3p) */}
          {hasThirdParty && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-20 shrink-0">Location</span>
              <select
                value={toggles.location}
                onChange={e => set({ location: e.target.value as LayerToggles['location'] })}
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                {LOCATION_LABELS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Support nature (L3/L4, 3p-supported) */}
          {isPlatformLayer && toggles.supported === '3p' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-20 shrink-0">License/support</span>
              <select
                value={toggles.support_nature ?? 'proprietary_inaccessible'}
                onChange={e => set({ support_nature: e.target.value as SupportNature })}
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                {SUPPORT_NATURE_LABELS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Platform kind (L3/L4, commercially-licensed 3p-supported) */}
          {showPlatformKind && (
            <div className="mt-2 border-t border-gray-100 pt-2 space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0 pt-0.5">Platform type</span>
                <div className="flex-1">
                  <select
                    value={platformMeta.platform_kind ?? 'unknown'}
                    onChange={e => onPlatformMetaChange({ ...platformMeta, platform_kind: e.target.value as PlatformLayerMeta['platform_kind'] })}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full"
                  >
                    {PLATFORM_KIND_LABELS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {platformMeta.platform_kind === 'open_source_based' && (
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0 pt-0.5">API conformance</span>
                  <div className="flex-1">
                    <select
                      value={platformMeta.interop_conformance ?? 'unknown'}
                      onChange={e => onPlatformMetaChange({ ...platformMeta, interop_conformance: e.target.value as PlatformLayerMeta['interop_conformance'] })}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full"
                    >
                      {INTEROP_CONFORMANCE_LABELS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Open-source platforms are only more reversible if they genuinely conform to open APIs.
                      A heavily customized fork may be as locked-in as a proprietary stack.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: question count + note badge */}
        <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[100px]">
          {hasThirdParty && questionCount > 0 && (
            <span className="text-xs text-blue-600 font-medium">
              +{questionCount} question{questionCount !== 1 ? 's' : ''}
            </span>
          )}
          {note && (
            <button
              onClick={() => setNoteOpen(o => !o)}
              className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium hover:bg-amber-200 transition"
              title="Commonly varies — confirm this cell"
            >
              ⚑ Confirm
            </button>
          )}
        </div>
      </div>

      {/* Note text */}
      {note && noteOpen && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          {note}
        </div>
      )}
    </div>
  );
}

interface Props {
  scenario: Exclude<ScenarioId, 'mixed'>;
  toggleProfile: ToggleProfile;
  platformMeta: PlatformMeta;
  questionCounts: Record<string, number>;
  onProfileChange: (tp: ToggleProfile) => void;
  onPlatformMetaChange: (m: PlatformMeta) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ScopingRefineTable({
  scenario, toggleProfile, platformMeta, questionCounts,
  onProfileChange, onPlatformMetaChange, onContinue, onBack,
}: Props) {
  const notes = getScenarioNotes(scenario);
  const [showDefaults, setShowDefaults] = useState(false);

  function updateLayer(layerId: LayerId, toggles: LayerToggles) {
    onProfileChange({ ...toggleProfile, [layerId]: toggles });
  }

  function updatePlatformLayer(layerId: 'L3' | 'L4', meta: PlatformLayerMeta) {
    onPlatformMetaChange({ ...platformMeta, [layerId]: meta });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Confirm your control profile</h2>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700">← Change scenario</button>
      </div>

      <p className="text-sm text-gray-500 mb-2">
        Pre-filled for <strong>{SCENARIO_LABELS[scenario]}</strong>.
        Cells marked <span className="text-amber-700 font-medium">⚑ Confirm</span> commonly vary — check them.
      </p>

      <button
        onClick={() => setShowDefaults(o => !o)}
        className="text-xs text-gray-400 underline hover:text-gray-600 mb-4"
      >
        {showDefaults ? 'Hide' : 'Why these defaults?'}
      </button>

      {showDefaults && (
        <div className="mb-4 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
          <div className="font-medium text-gray-700 mb-1">{SCENARIO_LABELS[scenario]} — default assumptions</div>
          {LAYERS.map(id => notes[id] ? (
            <div key={id}><span className="font-mono font-medium text-gray-600">{id}</span> — {notes[id]}</div>
          ) : null)}
        </div>
      )}

      <div className="space-y-3 mb-6">
        {LAYERS.map(id => (
          <LayerRow
            key={id}
            layerId={id}
            toggles={toggleProfile[id]}
            note={notes[id]}
            questionCount={questionCounts[id] ?? 0}
            platformMeta={(id === 'L3' || id === 'L4') ? (platformMeta[id] ?? {}) : undefined}
            showPlatformFacets={true}
            onChange={t => updateLayer(id, t)}
            onPlatformMetaChange={m => updatePlatformLayer(id as 'L3' | 'L4', m)}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onContinue}
          className="bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 transition"
        >
          Review & confirm →
        </button>
      </div>
    </div>
  );
}
