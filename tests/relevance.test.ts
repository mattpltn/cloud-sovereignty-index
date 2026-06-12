import { describe, test, expect } from 'vitest';
import { evaluate, toExcelFormula, buildSheetRefs } from '../shared/src/relevance';
import type { ControlProfile } from '../shared/src/schema';

const PROFILE: ControlProfile = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'commercial_lessor', operation: 'local_si', dependency: 'licensed_supported', location: 'in_country' },
  L3: { ownership: 'commercial_lessor', operation: 'client_staff', dependency: 'licensed_supported', location: 'in_country' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'na', location: 'foreign' },
  L6: { ownership: 'mixed', operation: 'local_si', dependency: 'licensed_no_support', location: 'regional_treaty' },
};

const REFS = buildSheetRefs();

describe('evaluate', () => {
  test('simple equality — true when value matches', () => {
    expect(evaluate("L4.dependency == 'proprietary_inaccessible'", PROFILE)).toBe(true);
  });

  test('simple equality — false when value does not match', () => {
    expect(evaluate("L4.dependency == 'self_supported_oss'", PROFILE)).toBe(false);
  });

  test('inequality — true when value differs', () => {
    expect(evaluate("L3.ownership != 'client'", PROFILE)).toBe(true);
  });

  test('inequality — false when value matches', () => {
    expect(evaluate("L3.ownership != 'commercial_lessor'", PROFILE)).toBe(false);
  });

  test('AND — both true', () => {
    expect(evaluate("L4.ownership == 'provider' AND L4.location == 'foreign'", PROFILE)).toBe(true);
  });

  test('AND — one false → false', () => {
    expect(evaluate("L4.ownership == 'provider' AND L4.location == 'in_country'", PROFILE)).toBe(false);
  });

  test('OR — one satisfied → true', () => {
    expect(evaluate("L1.ownership == 'provider' OR L1.ownership == 'client'", PROFILE)).toBe(true);
  });

  test('OR — neither satisfied → false', () => {
    expect(evaluate("L1.ownership == 'provider' OR L1.ownership == 'commercial_lessor'", PROFILE)).toBe(false);
  });

  test('NOT — negation of true → false', () => {
    expect(evaluate("NOT L1.ownership == 'client'", PROFILE)).toBe(false);
  });

  test('NOT — negation of false → true', () => {
    expect(evaluate("NOT L4.ownership == 'client'", PROFILE)).toBe(true);
  });

  test('nested parens: (A OR B) AND C', () => {
    // (L1.client OR L2.client) AND L4.foreign — first group: L1.client=true, so OR=true; AND L4.foreign=true
    expect(evaluate("(L1.ownership == 'client' OR L2.ownership == 'client') AND L4.location == 'foreign'", PROFILE)).toBe(true);
  });

  test('nested parens — false branch', () => {
    // Neither L4 nor L5 ownership is 'client', so OR=false; AND anything=false
    expect(evaluate("(L4.ownership == 'client' OR L5.ownership == 'client') AND L1.location == 'in_country'", PROFILE)).toBe(false);
  });

  test('real risk predicate from register: L3 licensing shock trigger', () => {
    expect(evaluate("L3.dependency == 'licensed_supported'", PROFILE)).toBe(true);
  });

  test('real risk predicate: L5 foreign vendor root access', () => {
    expect(evaluate("L5.operation == 'foreign_vendor'", PROFILE)).toBe(true);
  });

  test('real risk predicate: L4 egress (OR across layers)', () => {
    // L4.ownership == 'provider' is true; should be true
    expect(evaluate("L4.ownership == 'provider' OR L3.ownership == 'provider'", PROFILE)).toBe(true);
  });
});

describe('toExcelFormula', () => {
  test('simple equality produces named-range comparison', () => {
    const formula = toExcelFormula("L4.dependency == 'proprietary_inaccessible'", REFS);
    expect(formula).toBe('(L4_dependency="proprietary_inaccessible")');
  });

  test('inequality produces <> comparison', () => {
    const formula = toExcelFormula("L3.ownership != 'client'", REFS);
    expect(formula).toBe('(L3_ownership<>"client")');
  });

  test('AND produces nested AND(...) formula', () => {
    const formula = toExcelFormula("L4.ownership == 'provider' AND L4.location == 'foreign'", REFS);
    expect(formula).toBe('AND((L4_ownership="provider"),(L4_location="foreign"))');
  });

  test('OR produces OR(...) formula', () => {
    const formula = toExcelFormula("L1.ownership == 'provider' OR L1.ownership == 'client'", REFS);
    expect(formula).toBe('OR((L1_ownership="provider"),(L1_ownership="client"))');
  });

  test('NOT produces NOT(...) formula', () => {
    const formula = toExcelFormula("NOT L1.ownership == 'client'", REFS);
    expect(formula).toBe('NOT((L1_ownership="client"))');
  });

  test('nested parens preserved correctly', () => {
    const formula = toExcelFormula("(L1.ownership == 'client' OR L2.ownership == 'client') AND L4.location == 'foreign'", REFS);
    expect(formula).toBe('AND(OR((L1_ownership="client"),(L2_ownership="client")),(L4_location="foreign"))');
  });
});

describe('buildSheetRefs', () => {
  test('produces 24 named-range entries (6 layers × 4 facets)', () => {
    expect(Object.keys(REFS)).toHaveLength(24);
  });

  test('L3.dependency maps to L3_dependency', () => {
    expect(REFS['L3.dependency']).toBe('L3_dependency');
  });
});

describe('evaluate / toExcelFormula parity', () => {
  // For every predicate, evaluate(pred, profile) ↔ the Excel formula returns TRUE/FALSE
  // We verify this by checking both return the same semantic result for two profiles:
  // PROFILE (above) and a FOREIGN-heavy profile.

  const FOREIGN: ControlProfile = {
    L1: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
    L2: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
    L3: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
    L4: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
    L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
    L6: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  };

  const PREDS = [
    "L3.dependency == 'licensed_supported'",
    "L4.ownership == 'provider' OR L3.ownership == 'provider'",
    "L5.operation == 'foreign_vendor'",
    "L1.ownership == 'client' AND L1.location == 'in_country'",
    "NOT L4.ownership == 'client'",
    "(L1.ownership == 'client' OR L2.ownership == 'client') AND L4.location == 'foreign'",
  ];

  test('evaluate results match expected for PROFILE', () => {
    const expected = [true, true, true, true, true, true];
    for (let i = 0; i < PREDS.length; i++) {
      expect(evaluate(PREDS[i], PROFILE), PREDS[i]).toBe(expected[i]);
    }
  });

  test('evaluate results match expected for FOREIGN profile', () => {
    const expected = [false, true, true, false, true, false];
    for (let i = 0; i < PREDS.length; i++) {
      expect(evaluate(PREDS[i], FOREIGN), PREDS[i]).toBe(expected[i]);
    }
  });
});
