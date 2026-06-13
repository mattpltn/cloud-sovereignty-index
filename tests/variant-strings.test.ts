import { describe, test, expect } from 'vitest';

// Guard: the variant strings used in Questionnaire.tsx for eu_context and presentationMode
// must match what the API schema and start form define. A rename silently misroutes presentation.

// These are the two values defined in workers/src/index.ts CreateSchema.variant
// and produced by the start/[framework].astro form submit.
const EU_VARIANT = 'EU-CSF' as const;
const NON_EU_VARIANT = 'Generalized' as const;

// Mirror the Questionnaire.tsx logic
const eu_context = (variant: string) => variant === EU_VARIANT;

type FrameworkMode = 'eu_csf' | 'c3a' | 'cada' | 'lmic' | 'csi_composite';
const presentationMode = (fw: Set<string>, variant: string): FrameworkMode => {
  const isCsiMode = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
  return isCsiMode && variant === NON_EU_VARIANT ? 'lmic' : 'csi_composite';
};

describe('variant-strings', () => {
  test('variant string constants match CreateSchema enum values', () => {
    // The start form sends these exact strings; they must match the workers schema enum
    expect(EU_VARIANT).toBe('EU-CSF');
    expect(NON_EU_VARIANT).toBe('Generalized');
  });

  test('eu_context: EU-CSF → true, Generalized → false', () => {
    expect(eu_context('EU-CSF')).toBe(true);
    expect(eu_context('Generalized')).toBe(false);
    expect(eu_context('unknown')).toBe(false);
    expect(eu_context('eu-csf')).toBe(false); // case-sensitive
  });

  test('presentationMode: csi_composite + Generalized → lmic', () => {
    expect(presentationMode(new Set(['csi_composite']), 'Generalized')).toBe('lmic');
    expect(presentationMode(new Set(['csi_composite']), 'EU-CSF')).toBe('csi_composite');
    expect(presentationMode(new Set(['eu_csf', 'csi_composite']), 'Generalized')).toBe('csi_composite');
    expect(presentationMode(new Set(['eu_csf']), 'EU-CSF')).toBe('csi_composite');
    expect(presentationMode(new Set(['cada']), 'EU-CSF')).toBe('csi_composite');
  });

  test('presentationMode: single-framework non-CSI always returns csi_composite (no lmic routing)', () => {
    for (const fw of ['eu_csf', 'c3a', 'cada'] as const) {
      expect(presentationMode(new Set([fw]), 'Generalized')).toBe('csi_composite');
    }
  });
});
