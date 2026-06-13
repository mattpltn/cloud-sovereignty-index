import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';
import { evaluate, toExcelFormula, buildSheetRefs } from '../shared/src/relevance';
import type { ControlProfile } from '../shared/src/schema';

const criteria = criteriaJson as unknown as CriteriaFile;

const allQuestions = criteria.objectives.flatMap(o => o.questions);
const csiLmicQuestions = allQuestions.filter(
  q => q.applies_to_csi_composite || (q as any).applies_to_lmic
);

const SOVEREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L3: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L4: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L5: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L6: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
};

const FOREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L2: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L3: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L6: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
};

const VALID_LAYERS = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
const VALID_PATTERNS = new Set(['vanish', 're-aim', 'sharpen', 'agnostic']);

describe('relevance-population', () => {
  test('every CSI/LMIC question has a relevance block', () => {
    const missing = csiLmicQuestions.filter(q => !(q as any).relevance);
    expect(missing.map(q => q.id)).toEqual([]);
  });

  test('every relevance block has a valid pattern', () => {
    for (const q of csiLmicQuestions) {
      const rel = (q as any).relevance;
      expect(VALID_PATTERNS.has(rel.pattern), `${q.id}: unknown pattern "${rel.pattern}"`).toBe(true);
    }
  });

  test('every question with pattern vanish has a non-empty show_when', () => {
    for (const q of csiLmicQuestions) {
      const rel = (q as any).relevance;
      if (rel.pattern === 'vanish') {
        expect(
          rel.show_when && rel.show_when.length > 0,
          `${q.id}: vanish pattern must have show_when`
        ).toBe(true);
      }
    }
  });

  test('agnostic and sharpen questions have no show_when', () => {
    for (const q of csiLmicQuestions) {
      const rel = (q as any).relevance;
      if (rel.pattern === 'agnostic' || rel.pattern === 'sharpen') {
        expect(rel.show_when, `${q.id}: ${rel.pattern} must not have show_when`).toBeUndefined();
      }
    }
  });

  test('layer field (if present) is a valid layer ID', () => {
    for (const q of csiLmicQuestions) {
      const rel = (q as any).relevance;
      if (rel.layer !== undefined) {
        expect(VALID_LAYERS.has(rel.layer), `${q.id}: invalid layer "${rel.layer}"`).toBe(true);
      }
    }
  });

  test('every show_when predicate evaluates without throwing on both sovereign and foreign profiles', () => {
    for (const q of csiLmicQuestions) {
      const showWhen: string | undefined = (q as any).relevance?.show_when;
      if (!showWhen) continue;
      expect(
        () => evaluate(showWhen, SOVEREIGN_PROFILE),
        `${q.id}: evaluate() threw on sovereign profile`
      ).not.toThrow();
      expect(
        () => evaluate(showWhen, FOREIGN_PROFILE),
        `${q.id}: evaluate() threw on foreign profile`
      ).not.toThrow();
    }
  });

  test('vanish questions show/hide correctly for targeted profiles', () => {
    // Each example tests the predicate against a profile designed to trigger it (true)
    // and a sovereign profile that should not trigger it (false).
    const VMWARE_PROFILE: ControlProfile = {
      ...SOVEREIGN_PROFILE,
      L3: { ownership: 'client', operation: 'client_staff', dependency: 'licensed_supported', location: 'in_country' },
    };
    const cases: Array<{ id: string; visible: ControlProfile; hidden: ControlProfile }> = [
      { id: 'SOV-2-01',      visible: FOREIGN_PROFILE, hidden: SOVEREIGN_PROFILE },   // L1 foreign → true
      { id: 'SOV-4-01',      visible: FOREIGN_PROFILE, hidden: SOVEREIGN_PROFILE },   // L5 foreign_vendor → true
      { id: 'SOV-6-02',      visible: VMWARE_PROFILE,  hidden: SOVEREIGN_PROFILE },   // L3.licensed_supported → true
      { id: 'SOV-4-15-CADA', visible: FOREIGN_PROFILE, hidden: SOVEREIGN_PROFILE },   // L4 provider-owned → true
      { id: 'SOV-6-09-LMIC', visible: FOREIGN_PROFILE, hidden: SOVEREIGN_PROFILE },   // L4 provider-owned → true
    ];
    for (const { id, visible, hidden } of cases) {
      const q = allQuestions.find(q => q.id === id);
      if (!q) continue;
      const showWhen: string = (q as any).relevance?.show_when;
      if (!showWhen) continue;
      expect(evaluate(showWhen, visible), `${id}: should be visible on triggering profile`).toBe(true);
      expect(evaluate(showWhen, hidden), `${id}: should be hidden on sovereign profile`).toBe(false);
    }
  });

  test('show_when ↔ toExcelFormula sync: same predicate produces valid Excel formula', () => {
    const sheetRefs = buildSheetRefs();
    const examples = [
      { id: 'SOV-2-01', showWhen: "L1.location == 'foreign' OR L1.location == 'trusted_third'" },
      { id: 'SOV-4-01', showWhen: "L5.operation == 'foreign_vendor'" },
      { id: 'SOV-4-15-CADA', showWhen: "L4.dependency == 'proprietary_inaccessible' OR L4.ownership == 'provider'" },
    ];
    for (const { id, showWhen } of examples) {
      const formula = toExcelFormula(showWhen, sheetRefs);
      expect(formula.length, `${id}: toExcelFormula returned empty string`).toBeGreaterThan(0);
      expect(formula, `${id}: formula should reference named ranges`).toMatch(/L[1-6]_/);
    }
  });

  test('XLSX template reads show_when from q.relevance.show_when (at least one question has non-static Relevant?)', () => {
    // This is a data-presence guard: at least one question with a show_when predicate exists,
    // which means the template-xlsx dynamic formula path will be exercised.
    const withShowWhen = csiLmicQuestions.filter(q => !!(q as any).relevance?.show_when);
    expect(withShowWhen.length).toBeGreaterThan(20);
  });
});
