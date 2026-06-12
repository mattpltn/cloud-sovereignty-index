import { describe, test, expect } from 'vitest';
import { ControlProfileSchema } from '../shared/src/schema';

const FULL_PROFILE = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L3: { ownership: 'commercial_lessor', operation: 'client_staff', dependency: 'licensed_supported', location: 'in_country' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'na', location: 'foreign' },
  L6: { ownership: 'mixed', operation: 'local_si', dependency: 'licensed_no_support', location: 'regional_treaty' },
};

describe('ControlProfileSchema', () => {
  test('validates a well-formed 6-layer profile', () => {
    const result = ControlProfileSchema.safeParse(FULL_PROFILE);
    expect(result.success).toBe(true);
  });

  test('rejects an unknown ownership value', () => {
    const bad = { ...FULL_PROFILE, L1: { ...FULL_PROFILE.L1, ownership: 'unknown_value' } };
    const result = ControlProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  test('nuance-capture: VMware-licensed-but-client-operated (L3) is reachable', () => {
    // This is the exact combination the spec mandates be representable:
    // a commercial licensing arrangement where the client's own staff operate the platform.
    const profile = {
      ...FULL_PROFILE,
      L3: {
        ownership: 'commercial_lessor',
        operation: 'client_staff',
        dependency: 'licensed_supported',
        location: 'in_country',
      },
    };
    const result = ControlProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.L3.ownership).toBe('commercial_lessor');
      expect(result.data.L3.operation).toBe('client_staff');
      expect(result.data.L3.dependency).toBe('licensed_supported');
    }
  });
});
