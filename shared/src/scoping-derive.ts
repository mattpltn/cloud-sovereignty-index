import type { LayerControl, ControlProfile } from './schema.js';
import scenarioDefaults from '../../data/scenario-defaults.json' assert { type: 'json' };

export type ScenarioId = 'hyperscaler' | 'regional_csp' | 'colocation' | 'own_datacenter' | 'managed_service' | 'mixed';
export type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type Toggle = 'client' | '3p';
export type SupportNature = 'licensed_supported' | 'licensed_no_support' | 'proprietary_inaccessible';

export interface LayerToggles {
  owned: Toggle;
  operated: Toggle;
  supported: Toggle;
  location: LayerControl['location'];
  support_nature?: SupportNature;
}

export type ToggleProfile = Record<LayerId, LayerToggles>;

/**
 * Derives a LayerControl from the simplified client/3p toggle state.
 * The commercial_lessor vs provider distinction is computed here — never shown to the user.
 *
 * owned=client                        → ownership: 'client'
 * owned=3p + operated=3p              → ownership: 'provider' (service operator)
 * owned=3p + operated=client          → ownership: 'commercial_lessor' (asset landlord)
 *
 * operated=client                     → operation: 'client_staff'
 * operated=3p + ownership=provider    → operation: 'provider'
 * operated=3p + location=foreign      → operation: 'foreign_vendor'
 * operated=3p + location≠foreign      → operation: 'local_si'
 *
 * supported=client                    → dependency: 'self_supported_oss'
 * supported=3p                        → dependency: support_nature (required)
 */
export function deriveLayerControl(t: LayerToggles): LayerControl {
  // Ownership
  let ownership: LayerControl['ownership'];
  if (t.owned === 'client') {
    ownership = 'client';
  } else if (t.operated === '3p') {
    ownership = 'provider';
  } else {
    ownership = 'commercial_lessor';
  }

  // Operation
  let operation: LayerControl['operation'];
  if (t.operated === 'client') {
    operation = 'client_staff';
  } else if (ownership === 'provider') {
    operation = 'provider';
  } else if (t.location === 'foreign') {
    operation = 'foreign_vendor';
  } else {
    operation = 'local_si';
  }

  // Dependency
  const dependency: LayerControl['dependency'] =
    t.supported === 'client' ? 'self_supported_oss' : (t.support_nature ?? 'proprietary_inaccessible');

  return { ownership, operation, dependency, location: t.location };
}

export function deriveControlProfile(tp: ToggleProfile): ControlProfile {
  return {
    L1: deriveLayerControl(tp.L1),
    L2: deriveLayerControl(tp.L2),
    L3: deriveLayerControl(tp.L3),
    L4: deriveLayerControl(tp.L4),
    L5: deriveLayerControl(tp.L5),
    L6: deriveLayerControl(tp.L6),
  };
}

const LAYERS: LayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

/** Build a ToggleProfile from a named scenario's defaults. */
export function togglesFromDefaults(scenario: Exclude<ScenarioId, 'mixed'>): ToggleProfile {
  const sd = (scenarioDefaults as Record<string, unknown>)[scenario] as Record<string, unknown>;
  const profile = {} as ToggleProfile;
  for (const id of LAYERS) {
    const cell = sd[id] as Record<string, unknown>;
    profile[id] = {
      owned: cell.owned as Toggle,
      operated: cell.operated as Toggle,
      supported: cell.supported as Toggle,
      location: (cell.location ?? 'in_country') as LayerControl['location'],
      support_nature: cell.support_nature as SupportNature | undefined,
    };
  }
  return profile;
}

/** Returns true when any toggle on the layer is third-party (ownership, operation, or dependency). */
export function layerHasThirdParty(lc: LayerControl): boolean {
  return (
    lc.ownership !== 'client' ||
    lc.operation !== 'client_staff' ||
    (lc.dependency !== 'self_supported_oss' && lc.dependency !== 'na')
  );
}

/** The notes attached to each layer cell for a given scenario. */
export function getScenarioNotes(scenario: Exclude<ScenarioId, 'mixed'>): Partial<Record<LayerId, string>> {
  const sd = (scenarioDefaults as Record<string, unknown>)[scenario] as Record<string, unknown>;
  const notes: Partial<Record<LayerId, string>> = {};
  for (const id of LAYERS) {
    const cell = sd[id] as Record<string, unknown>;
    if (cell._note) notes[id] = cell._note as string;
  }
  return notes;
}

export const SCENARIO_LABELS: Record<Exclude<ScenarioId, 'mixed'>, string> = {
  hyperscaler: 'Global cloud provider',
  regional_csp: 'Local or regional cloud provider',
  colocation: 'Our cloud in rented datacenter space',
  own_datacenter: 'Our own datacenter, self-run',
  managed_service: 'Vendor builds and/or operates our cloud',
};

export const SCENARIO_ONELINERS: Record<ScenarioId, string> = {
  hyperscaler: 'We use a global provider (AWS, Azure, Google, Huawei, etc.).',
  regional_csp: 'We subscribe to a cloud run by a national or regional provider.',
  colocation: 'We rent datacenter space and run our own servers/cloud there.',
  own_datacenter: 'We own the datacenter and run everything ourselves.',
  managed_service: 'A vendor builds and/or operates our cloud for us.',
  mixed: 'My setup combines several of these, or I\'m not sure.',
};
