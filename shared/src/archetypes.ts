import { evaluate } from './relevance.js';
import type { LayerControl, ControlProfile } from './schema.js';

// ── The archetype catalog (Cookbook §3) ───────────────────────────────────────
//
// A question is anchored to a FACET of a LAYER, never to a scenario. Each archetype
// names one facet trigger + the layers where it is meaningful. show_when predicates
// are GENERATED from (archetype, layer) tags via clauseFor() — never hand-typed.
//
// The decisive rule (the VMware case): ownership/operation/location triggers are
// ruled out when the client controls that facet; `dependency` (REVERSIBILITY /
// SUPPORT_CONTINUITY) triggers are NOT ruled out by ownership. You can own and
// operate a platform and still be unable to self-patch because the SOFTWARE is
// licensed. REVERSIBILITY therefore fires on the dependency facet (with an
// ownership==provider escape hatch for the lock-in case), deliberately ignoring
// client ownership.

export type ArchetypeId =
  | 'JURISDICTION'
  | 'PHYSICAL_CUSTODY'
  | 'DATA_RESIDENCY_SERVICE'
  | 'THIRD_PARTY_OPERATION'
  | 'REVERSIBILITY'
  | 'SUPPORT_CONTINUITY'
  | 'SELF_SUFFICIENCY';

export type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export const ALL_LAYERS: LayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

export interface ArchetypeTag {
  archetype: ArchetypeId;
  layer: LayerId;
}

interface ArchetypeDef {
  id: ArchetypeId;
  /** Layers where this archetype is meaningful. */
  layers: LayerId[];
  /** Generates the show_when sub-clause for one layer. The single source of truth
   *  for both visibility (via evaluate) and the coverage ground-truth (archetypeFires). */
  clauseFor: (layer: LayerId) => string;
  /** What the archetype asks (for the coverage report + docs). */
  asks: string;
}

const or = (parts: string[]) => `(${parts.join(' OR ')})`;

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  // foreign-law reach over the asset / staff / data. Baseline location = in_country;
  // any deviation is a jurisdiction surface.
  JURISDICTION: {
    id: 'JURISDICTION',
    // Foreign-law reach exists wherever data is held/processed or the service is operated:
    // the facility (L1), the hardware holding data (L2), and the operating/processing
    // layers (L3 virtualization, L4 managed/PaaS, L5 operations). A hybrid with an
    // in-country facility but a foreign PaaS/ops layer still carries extraterritorial exposure.
    layers: ['L1', 'L2', 'L3', 'L4', 'L5'],
    clauseFor: (L) => or([
      `${L}.location == 'regional_treaty'`,
      `${L}.location == 'trusted_third'`,
      `${L}.location == 'foreign'`,
      `${L}.location == 'unknown'`,
    ]),
    asks: 'foreign-law reach over the asset, staff, or data at this layer',
  },

  // landlord / hardware-holder physical access & jurisdiction. Fires whenever the
  // client does not own the asset (landlord, provider, or mixed custody).
  PHYSICAL_CUSTODY: {
    id: 'PHYSICAL_CUSTODY',
    layers: ['L1', 'L2'],
    clauseFor: (L) => or([
      `${L}.ownership == 'commercial_lessor'`,
      `${L}.ownership == 'provider'`,
      `${L}.ownership == 'mixed'`,
    ]),
    asks: 'physical access & jurisdiction of the asset custodian (landlord / hardware holder)',
  },

  // provider must offer in-bloc residency service options on a data-bearing layer.
  // Anchored to the data layers, NOT the facility — this is the colocation fix.
  DATA_RESIDENCY_SERVICE: {
    id: 'DATA_RESIDENCY_SERVICE',
    layers: ['L2', 'L3', 'L4'],
    clauseFor: (L) => `(${L}.ownership == 'provider')`,
    asks: 'provider-offered in-bloc data residency service options',
  },

  // external operator: personnel jurisdiction, operational control, disconnect risk.
  // Fires on the coarse trigger (operated by someone other than client staff); the
  // specific value (provider | foreign_vendor | local_si) drives framing, not visibility.
  THIRD_PARTY_OPERATION: {
    id: 'THIRD_PARTY_OPERATION',
    layers: ['L3', 'L4', 'L5'],
    clauseFor: (L) => or([
      `${L}.operation == 'local_si'`,
      `${L}.operation == 'foreign_vendor'`,
      `${L}.operation == 'provider'`,
    ]),
    asks: 'an external party operates this layer: personnel jurisdiction, control, disconnect',
  },

  // can you self-patch a zero-day, fork, and migrate away? Fires on the DEPENDENCY
  // facet (any licensed/proprietary software) OR provider ownership lock-in —
  // deliberately independent of who owns/operates the layer (the VMware case).
  REVERSIBILITY: {
    id: 'REVERSIBILITY',
    layers: ['L3', 'L4', 'L6'],
    clauseFor: (L) => or([
      `${L}.dependency == 'licensed_supported'`,
      `${L}.dependency == 'licensed_no_support'`,
      `${L}.dependency == 'proprietary_inaccessible'`,
      `${L}.ownership == 'provider'`,
    ]),
    asks: 'self-patch a zero-day, fork the source, and migrate away (reversibility of the dependency)',
  },

  // C3A vendor-disruption: vendor exits / changes licensing. Fires only when there is
  // external software under a support/licence relationship.
  SUPPORT_CONTINUITY: {
    id: 'SUPPORT_CONTINUITY',
    layers: ['L3', 'L4'],
    clauseFor: (L) => or([
      `${L}.dependency == 'licensed_supported'`,
      `${L}.dependency == 'licensed_no_support'`,
    ]),
    asks: 'continuity if the software vendor exits, is acquired, or changes licensing',
  },

  // VERIFICATION (sovereign scenarios): prove you can actually run/patch/exit it
  // yourself. Fires only at the sovereign baseline for the dependency+operation facets.
  SELF_SUFFICIENCY: {
    id: 'SELF_SUFFICIENCY',
    layers: ['L3', 'L4'],
    clauseFor: (L) => `(${L}.dependency == 'self_supported_oss' AND ${L}.operation == 'client_staff')`,
    asks: 'prove in-house capability to run, patch, and exit the self-operated platform',
  },
};

export const ALL_ARCHETYPES = Object.keys(ARCHETYPES) as ArchetypeId[];

const SOVEREIGN_LC: LayerControl = {
  ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country',
};

/** Profile that is sovereign everywhere except `layer`, which carries `lc`. */
function profileWithLayer(layer: LayerId, lc: LayerControl): ControlProfile {
  const base: Record<LayerId, LayerControl> = {
    L1: SOVEREIGN_LC, L2: SOVEREIGN_LC, L3: SOVEREIGN_LC,
    L4: SOVEREIGN_LC, L5: SOVEREIGN_LC, L6: SOVEREIGN_LC,
  };
  base[layer] = lc;
  return base as ControlProfile;
}

/**
 * Ground truth for the coverage report: does this archetype activate for a single
 * layer's control? Uses the SAME clause that generates the show_when, so the
 * show/hide engine and the coverage engine can never disagree (invariant §6c).
 */
export function archetypeFires(id: ArchetypeId, layer: LayerId, lc: LayerControl): boolean {
  const def = ARCHETYPES[id];
  if (!def.layers.includes(layer)) return false;
  return evaluate(def.clauseFor(layer), profileWithLayer(layer, lc));
}

/** All (archetype, layer) pairs active for a full control profile. */
export function activeArchetypes(profile: ControlProfile): ArchetypeTag[] {
  const tags: ArchetypeTag[] = [];
  for (const id of ALL_ARCHETYPES) {
    for (const layer of ARCHETYPES[id].layers) {
      if (archetypeFires(id, layer, profile[layer])) tags.push({ archetype: id, layer });
    }
  }
  return tags;
}

/** Generate the full show_when for a set of archetype tags (OR-combined). */
export function generateShowWhen(tags: ArchetypeTag[]): string {
  const clauses = tags.map(t => ARCHETYPES[t.archetype].clauseFor(t.layer));
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];
  return clauses.join(' OR ');
}
