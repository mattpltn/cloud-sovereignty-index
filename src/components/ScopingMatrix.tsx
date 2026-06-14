import React, { useState } from 'react';
import type { ControlProfile, LayerControl } from '../../shared/src/schema';

type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
type OwnershipZone = 'client' | 'commercial_lessor' | 'provider';
type Operation = LayerControl['operation'];
type Dependency = LayerControl['dependency'];
type Location = LayerControl['location'];

const LAYER_LABELS: Record<LayerId, { name: string; subtitle: string }> = {
  L1: { name: 'Facility', subtitle: 'Building, power, physical security' },
  L2: { name: 'Hardware', subtitle: 'Servers, storage, network' },
  L3: { name: 'Virtualization', subtitle: 'IaaS fabric — hypervisor, object storage' },
  L4: { name: 'Managed / PaaS', subtitle: 'Managed DBs, serverless, AI services' },
  L5: { name: 'Operations', subtitle: 'Privileged access, patching, NOC/SOC' },
  L6: { name: 'Consumption', subtitle: 'Workloads and criticality profile' },
};

const ZONE_LABELS: Record<OwnershipZone, string> = {
  client: 'Client',
  commercial_lessor: 'Commercial',
  provider: 'Provider',
};

const ZONE_COLORS: Record<OwnershipZone, string> = {
  client: 'bg-green-50 border-green-300',
  commercial_lessor: 'bg-amber-50 border-amber-300',
  provider: 'bg-red-50 border-red-300',
};

const ZONE_HEADER_COLORS: Record<OwnershipZone, string> = {
  client: 'bg-green-100 text-green-800',
  commercial_lessor: 'bg-amber-100 text-amber-800',
  provider: 'bg-red-100 text-red-800',
};

const OPERATION_OPTIONS: Array<{ value: Operation; label: string }> = [
  { value: 'client_staff', label: 'Client staff' },
  { value: 'local_si', label: 'Local systems integrator' },
  { value: 'foreign_vendor', label: 'Foreign vendor' },
  { value: 'provider', label: 'Provider' },
  { value: 'na', label: 'Not applicable' },
];

const DEPENDENCY_OPTIONS: Array<{ value: Dependency; label: string }> = [
  { value: 'self_supported_oss', label: 'Self-supported open-source' },
  { value: 'licensed_supported', label: 'Licensed (vendor-supported)' },
  { value: 'licensed_no_support', label: 'Licensed (no vendor support)' },
  { value: 'proprietary_inaccessible', label: 'Proprietary / closed platform' },
  { value: 'na', label: 'Not applicable' },
];

const LOCATION_OPTIONS: Array<{ value: Location; label: string }> = [
  { value: 'in_country', label: 'In-country' },
  { value: 'regional_treaty', label: 'Treaty-partner jurisdiction' },
  { value: 'trusted_third', label: 'Trusted third country' },
  { value: 'foreign', label: 'Foreign jurisdiction' },
  { value: 'unknown', label: 'Unknown' },
];

type LayerState = {
  ownership: OwnershipZone;
  operation: Operation;
  dependency: Dependency;
  location: Location;
};

const DEFAULT_LAYER: LayerState = {
  ownership: 'client',
  operation: 'client_staff',
  dependency: 'self_supported_oss',
  location: 'in_country',
};

function toLayerControl(s: LayerState): LayerControl {
  return { ownership: s.ownership, operation: s.operation, dependency: s.dependency, location: s.location };
}

function layerStateToProfile(state: Record<LayerId, LayerState>): ControlProfile {
  return {
    L1: toLayerControl(state.L1),
    L2: toLayerControl(state.L2),
    L3: toLayerControl(state.L3),
    L4: toLayerControl(state.L4),
    L5: toLayerControl(state.L5),
    L6: toLayerControl(state.L6),
  };
}

// Expansion rules per spec:
// - L3, L4: always show dependency
// - Commercial/Provider ownership: show operation
// - L1 client + in_country: no operation facet
function showOperation(layerId: LayerId, s: LayerState): boolean {
  if (layerId === 'L1' && s.ownership === 'client' && s.location === 'in_country') return false;
  return s.ownership === 'commercial_lessor' || s.ownership === 'provider';
}

function showDependency(layerId: LayerId): boolean {
  return layerId === 'L3' || layerId === 'L4';
}

interface LayerCardProps {
  layerId: LayerId;
  state: LayerState;
  dragging: boolean;
  onChange: (s: LayerState) => void;
  onDragStart: () => void;
  readonly?: boolean;
}

function LayerCard({ layerId, state, dragging, onChange, onDragStart, readonly }: LayerCardProps) {
  const info = LAYER_LABELS[layerId];
  const showOp = showOperation(layerId, state);
  const showDep = showDependency(layerId);

  return (
    <div
      draggable={!readonly}
      onDragStart={readonly ? undefined : onDragStart}
      className={`border rounded-lg p-3 bg-white shadow-sm select-none ${readonly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${dragging ? 'opacity-50 ring-2 ring-blue-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-sm text-gray-800">{layerId} — {info.name}</span>
          <p className="text-xs text-gray-500 mt-0.5">{info.subtitle}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_HEADER_COLORS[state.ownership]}`}>
          {ZONE_LABELS[state.ownership]}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {showOp && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 w-20 shrink-0">Operation</span>
            <select
              className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white"
              value={state.operation}
              onChange={e => onChange({ ...state, operation: e.target.value as Operation })}
              disabled={readonly}
            >
              {OPERATION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}

        {showDep && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 w-20 shrink-0">Dependency</span>
            <select
              className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white"
              value={state.dependency}
              onChange={e => onChange({ ...state, dependency: e.target.value as Dependency })}
              disabled={readonly}
            >
              {DEPENDENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 w-20 shrink-0">Location</span>
          <select
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white"
            value={state.location}
            onChange={e => onChange({ ...state, location: e.target.value as Location })}
            disabled={readonly}
          >
            {LOCATION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

interface DropZoneProps {
  zone: OwnershipZone;
  layers: LayerId[];
  states: Record<LayerId, LayerState>;
  draggingLayer: LayerId | null;
  onDrop: (zone: OwnershipZone) => void;
  onLayerChange: (layerId: LayerId, s: LayerState) => void;
  onDragStart: (layerId: LayerId) => void;
  readonly?: boolean;
}

function DropZone({ zone, layers, states, draggingLayer, onDrop, onLayerChange, onDragStart, readonly }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const colors = ZONE_COLORS[zone];
  const headerColors = ZONE_HEADER_COLORS[zone];

  return (
    <div
      className={`flex-1 border-2 rounded-xl p-3 min-h-48 transition-colors ${colors} ${dragOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      onDragOver={readonly ? undefined : e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={readonly ? undefined : () => setDragOver(false)}
      onDrop={readonly ? undefined : () => { setDragOver(false); onDrop(zone); }}
    >
      <div className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded mb-2 ${headerColors}`}>
        {ZONE_LABELS[zone]}
      </div>
      <div className="space-y-2">
        {layers.map(layerId => (
          <LayerCard
            key={layerId}
            layerId={layerId}
            state={states[layerId]}
            dragging={draggingLayer === layerId}
            onChange={s => onLayerChange(layerId, s)}
            onDragStart={() => onDragStart(layerId)}
            readonly={readonly}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  initialProfile?: Partial<ControlProfile>;
  onProfileChange: (profile: ControlProfile) => void;
  readonly?: boolean;
}

const LAYERS: LayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

export function ScopingMatrix({ initialProfile, onProfileChange, readonly }: Props) {
  const [states, setStates] = useState<Record<LayerId, LayerState>>(() => {
    const init: Record<LayerId, LayerState> = {} as Record<LayerId, LayerState>;
    for (const id of LAYERS) {
      const existing = initialProfile?.[id];
      init[id] = existing
        ? { ownership: (existing.ownership ?? 'client') as OwnershipZone, operation: existing.operation, dependency: existing.dependency, location: existing.location }
        : { ...DEFAULT_LAYER };
    }
    return init;
  });

  const [draggingLayer, setDraggingLayer] = useState<LayerId | null>(null);

  function updateState(layerId: LayerId, next: LayerState) {
    const updated = { ...states, [layerId]: next };
    setStates(updated);
    onProfileChange(layerStateToProfile(updated));
  }

  function handleDrop(zone: OwnershipZone) {
    if (!draggingLayer) return;
    const current = states[draggingLayer];
    const next: LayerState = { ...current, ownership: zone };
    // Auto-set operation when dropping to provider
    if (zone === 'provider' && current.operation === 'client_staff') {
      next.operation = 'provider';
    }
    // Auto-clear operation for client placement
    if (zone === 'client' && current.operation === 'provider') {
      next.operation = 'client_staff';
    }
    updateState(draggingLayer, next);
    setDraggingLayer(null);
  }

  const byZone = (zone: OwnershipZone) => LAYERS.filter(id => states[id].ownership === zone);

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        Drag each layer to the zone that reflects who owns it. Expand facets appear automatically where they affect the risk profile.
      </p>
      <div className="flex gap-3 items-start">
        {(['client', 'commercial_lessor', 'provider'] as OwnershipZone[]).map(zone => (
          <DropZone
            key={zone}
            zone={zone}
            layers={byZone(zone)}
            states={states}
            draggingLayer={draggingLayer}
            onDrop={handleDrop}
            onLayerChange={updateState}
            onDragStart={setDraggingLayer}
            readonly={readonly}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Legend: <span className="text-green-700">Client</span> — you own and control it. <span className="text-amber-700">Commercial</span> — third-party ownership, varying operational control. <span className="text-red-700">Provider</span> — provider-owned and operated.
      </p>
    </div>
  );
}
