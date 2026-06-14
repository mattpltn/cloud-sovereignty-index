import { describe, test, expect } from 'vitest';
import {
  resolvePlatformHint,
  isLadderTierEligible,
  PLATFORM_SENSITIVE_CONTROLS,
  type PlatformMeta,
} from '../shared/src/platform-resolution';

const OPEN_DEMONSTRATED: PlatformMeta = {
  L3: { platform_kind: 'open_source_based', interop_conformance: 'demonstrated' },
};
const OPEN_CLAIMED: PlatformMeta = {
  L3: { platform_kind: 'open_source_based', interop_conformance: 'claimed' },
};
const OPEN_NONE: PlatformMeta = {
  L3: { platform_kind: 'open_source_based', interop_conformance: 'none' },
};
const PROPRIETARY: PlatformMeta = {
  L3: { platform_kind: 'proprietary' },
};
const UNKNOWN: PlatformMeta = {
  L3: { platform_kind: 'unknown' },
};

describe('platform-resolution', () => {
  // ── Forkability cluster: open_source_based alone is sufficient ─────────────

  test('open_source_based + demonstrated → forkability cluster hint=yes', () => {
    for (const q of ['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03']) {
      const r = resolvePlatformHint(q, OPEN_DEMONSTRATED);
      expect(r.hint, `${q} should be yes`).toBe('yes');
    }
  });

  test('open_source_based + claimed → forkability cluster still hint=yes (type alone, no conformance required)', () => {
    for (const q of ['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03']) {
      const r = resolvePlatformHint(q, OPEN_CLAIMED);
      expect(r.hint, `${q} should be yes with claimed`).toBe('yes');
    }
  });

  test('open_source_based + none → forkability cluster still hint=yes', () => {
    for (const q of ['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03']) {
      const r = resolvePlatformHint(q, OPEN_NONE);
      expect(r.hint).toBe('yes');
    }
  });

  test('proprietary → forkability cluster hint=no', () => {
    for (const q of ['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03']) {
      const r = resolvePlatformHint(q, PROPRIETARY);
      expect(r.hint, `${q} should be no for proprietary`).toBe('no');
    }
  });

  // ── Interop-gated controls: require demonstrated conformance ───────────────

  test('open_source_based + demonstrated → SOV-6-05 and SOV-6-06 hint=yes', () => {
    for (const q of ['SOV-6-05', 'SOV-6-06']) {
      expect(resolvePlatformHint(q, OPEN_DEMONSTRATED).hint).toBe('yes');
    }
  });

  test('open_source_based + claimed → interop controls hint=no (anti-halo gate)', () => {
    for (const q of ['SOV-6-05', 'SOV-6-06']) {
      const r = resolvePlatformHint(q, OPEN_CLAIMED);
      expect(r.hint, `${q} should be no for claimed (anti-halo)`).toBe('no');
    }
  });

  test('open_source_based + none → interop controls hint=no', () => {
    for (const q of ['SOV-6-05', 'SOV-6-06']) {
      expect(resolvePlatformHint(q, OPEN_NONE).hint).toBe('no');
    }
  });

  test('proprietary → interop controls hint=no', () => {
    for (const q of ['SOV-6-05', 'SOV-6-06']) {
      expect(resolvePlatformHint(q, PROPRIETARY).hint).toBe('no');
    }
  });

  // ── Parity guard: no signal for non-sensitive controls ────────────────────

  test('parity: non-platform-sensitive controls return hint=null regardless of platform kind', () => {
    const nonSensitive = ['SOV-1-01', 'SOV-2-01', 'SOV-3-01', 'SOV-4-01', 'SOV-5-01', 'SOV-7-01'];
    for (const q of nonSensitive) {
      expect(PLATFORM_SENSITIVE_CONTROLS.has(q), `${q} should NOT be in the sensitive set`).toBe(false);
      expect(resolvePlatformHint(q, OPEN_DEMONSTRATED).hint).toBeNull();
      expect(resolvePlatformHint(q, PROPRIETARY).hint).toBeNull();
    }
  });

  test('PLATFORM_SENSITIVE_CONTROLS contains exactly the 5 named controls and no others', () => {
    const expected = ['SOV-6-02', 'SOV-6-02-AC', 'SOV-6-03', 'SOV-6-05', 'SOV-6-06'];
    expect([...PLATFORM_SENSITIVE_CONTROLS].sort()).toEqual(expected.sort());
  });

  test('unknown platform kind → hint=null (conservative, no false signal)', () => {
    for (const q of [...PLATFORM_SENSITIVE_CONTROLS]) {
      expect(resolvePlatformHint(q, UNKNOWN).hint).toBeNull();
    }
  });

  // ── SOV-5-08 substitutability ladder ──────────────────────────────────────

  test('Tier A/B: only eligible with open_source_based + demonstrated', () => {
    expect(isLadderTierEligible(OPEN_DEMONSTRATED, 'A')).toBe(true);
    expect(isLadderTierEligible(OPEN_DEMONSTRATED, 'B')).toBe(true);
    expect(isLadderTierEligible(OPEN_CLAIMED, 'A')).toBe(false);
    expect(isLadderTierEligible(OPEN_CLAIMED, 'B')).toBe(false);
    expect(isLadderTierEligible(OPEN_NONE, 'A')).toBe(false);
    expect(isLadderTierEligible(PROPRIETARY, 'A')).toBe(false);
    expect(isLadderTierEligible(PROPRIETARY, 'B')).toBe(false);
  });

  test('Tier C: always eligible regardless of platform kind', () => {
    expect(isLadderTierEligible(OPEN_DEMONSTRATED, 'C')).toBe(true);
    expect(isLadderTierEligible(PROPRIETARY, 'C')).toBe(true);
    expect(isLadderTierEligible({}, 'C')).toBe(true);
  });

  test('L4 meta falls back to L4 when L3 not set', () => {
    const metaL4Only: PlatformMeta = {
      L4: { platform_kind: 'open_source_based', interop_conformance: 'demonstrated' },
    };
    expect(resolvePlatformHint('SOV-6-02', metaL4Only).hint).toBe('yes');
    expect(isLadderTierEligible(metaL4Only, 'A')).toBe(true);
  });

  test('empty meta → hint=null, Tier A/B not eligible', () => {
    expect(resolvePlatformHint('SOV-6-02', {}).hint).toBeNull();
    expect(isLadderTierEligible({}, 'A')).toBe(false);
  });
});
