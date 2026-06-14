/**
 * Platform-nature resolution for the L3/L4 scoping facets (Amendment 2).
 *
 * These five controls already differentiate open-source-based from proprietary platforms
 * (sourced from C3A §2.6 and EU-CSF SOV-6). Outside this cluster, OpenStack and VMware
 * score identically — jurisdiction, licensing-change risk, operations, skills, support
 * continuity are the same for both. See DR-PLAT-1/2/3.
 */

export type PlatformKind = 'proprietary' | 'open_source_based' | 'unknown';
export type InteropConformance = 'demonstrated' | 'claimed' | 'none' | 'unknown';

export interface PlatformLayerMeta {
  platform_kind?: PlatformKind;
  interop_conformance?: InteropConformance;
}

export interface PlatformMeta {
  L3?: PlatformLayerMeta;
  L4?: PlatformLayerMeta;
}

// Controls where platform nature may produce a different hint (sourced, bounded set).
export const PLATFORM_SENSITIVE_CONTROLS = new Set([
  'SOV-6-02',
  'SOV-6-02-AC',
  'SOV-6-03',
  'SOV-6-05',
  'SOV-6-06',
]);

// Controls where the advantage requires interop_conformance === 'demonstrated'.
const INTEROP_GATED = new Set(['SOV-6-05', 'SOV-6-06']);

// Controls in the forkability/remediation cluster (open_source_based alone is sufficient).
const FORKABILITY_CLUSTER = new Set(['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03']);

function effectiveMeta(meta: PlatformMeta): PlatformLayerMeta {
  // L3 (Virtualization) is the primary platform layer. Fall back to L4 if L3 not set.
  return meta.L3 ?? meta.L4 ?? {};
}

/**
 * Returns a hint for pre-filling or surfacing to the user.
 * Returns null when platform_meta provides no signal for this control.
 * DOES NOT override user answers — hint only.
 */
export function resolvePlatformHint(
  questionId: string,
  meta: PlatformMeta
): { hint: 'yes' | 'no' | null; reason: string } {
  if (!PLATFORM_SENSITIVE_CONTROLS.has(questionId)) {
    return { hint: null, reason: 'Not platform-sensitive' };
  }

  const { platform_kind, interop_conformance } = effectiveMeta(meta);

  if (!platform_kind || platform_kind === 'unknown') {
    return { hint: null, reason: 'Platform kind not declared — treating conservatively' };
  }

  if (platform_kind === 'proprietary') {
    return {
      hint: 'no',
      reason: FORKABILITY_CLUSTER.has(questionId)
        ? 'Proprietary platform: cannot self-remediate or fork if vendor is lost (DR-PLAT-2)'
        : 'Proprietary platform: closed APIs, no open-standards conformance (DR-PLAT-2)',
    };
  }

  // open_source_based
  if (FORKABILITY_CLUSTER.has(questionId)) {
    return {
      hint: 'yes',
      reason: 'Open-source-based platform: forkable and remediable independently of vendor (DR-PLAT-2)',
    };
  }

  // INTEROP_GATED controls (SOV-6-05, SOV-6-06) require demonstrated conformance
  if (INTEROP_GATED.has(questionId)) {
    const demonstrated = interop_conformance === 'demonstrated';
    return {
      hint: demonstrated ? 'yes' : 'no',
      reason: demonstrated
        ? 'Open-source-based with demonstrated open-API conformance (DR-PLAT-2)'
        : 'Open-source-based but interop conformance not demonstrated — not eligible for open-API advantage (anti-halo gate, DR-PLAT-2)',
    };
  }

  return { hint: null, reason: 'No platform signal for this control' };
}

/**
 * Whether the platform meta supports Tier A or B eligibility on the SOV-5-08
 * substitutability ladder. Requires open_source_based + demonstrated conformance.
 */
export function isLadderTierEligible(meta: PlatformMeta, tier: 'A' | 'B' | 'C'): boolean {
  if (tier === 'C') return true; // always eligible for Tier C or below
  const { platform_kind, interop_conformance } = effectiveMeta(meta);
  return platform_kind === 'open_source_based' && interop_conformance === 'demonstrated';
}
