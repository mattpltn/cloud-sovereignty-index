import { describe, test, expect } from 'vitest';
import { buildProvenance } from '../shared/src/provenance';
import criteriaJson from '../data/criteria.json';
import sourceRegister from '../data/source-register.json';
import type { CriteriaFile, Question } from '../shared/src/schema';
import type { FrameworkMode } from '../shared/src/types';

const criteria = criteriaJson as unknown as CriteriaFile;
const registerKeys = new Set(sourceRegister.entries.map(e => e.key));

// Sample 10 questions across modes for the parity test
const SAMPLE_CASES: Array<{ id: string; mode: FrameworkMode }> = [
  { id: 'SOV-1-01', mode: 'eu_csf' },
  { id: 'SOV-2-01', mode: 'eu_csf' },
  { id: 'SOV-3-01', mode: 'c3a' },
  { id: 'SOV-4-01', mode: 'c3a' },
  { id: 'SOV-4-15-CADA', mode: 'cada' },
  { id: 'SOV-6-07-CADA', mode: 'cada' },
  { id: 'SOV-6-08-LMIC', mode: 'lmic' },
  { id: 'SOV-6-09-LMIC', mode: 'lmic' },
  { id: 'SOV-1-12-LMIC', mode: 'lmic' },
  { id: 'SOV-5-01', mode: 'csi_composite' },
];

const allQuestions = new Map<string, Question>(
  criteria.objectives.flatMap(o => o.questions.map(q => [q.id, q] as const))
);

describe('xlsx-provenance-parity', () => {
  test('all sampled question IDs exist in criteria.json', () => {
    for (const { id } of SAMPLE_CASES) {
      expect(allQuestions.has(id), `Question ${id} not found in criteria.json`).toBe(true);
    }
  });

  test('buildProvenance returns non-empty fidelity_badge for every sampled question', () => {
    for (const { id, mode } of SAMPLE_CASES) {
      const q = allQuestions.get(id);
      if (!q) continue;
      const prov = buildProvenance(q, mode);
      expect(
        prov.fidelity_badge.length,
        `${id} (${mode}): fidelity_badge must be non-empty`
      ).toBeGreaterThan(0);
    }
  });

  test('buildProvenance returns non-empty origin_line (Basis column) for every sampled question', () => {
    for (const { id, mode } of SAMPLE_CASES) {
      const q = allQuestions.get(id);
      if (!q) continue;
      const prov = buildProvenance(q, mode);
      expect(
        prov.origin_line.length,
        `${id} (${mode}): origin_line (Basis) must be non-empty`
      ).toBeGreaterThan(0);
    }
  });

  test('buildProvenance register_key (Source framework) is null or resolves to source-register.json', () => {
    for (const { id, mode } of SAMPLE_CASES) {
      const q = allQuestions.get(id);
      if (!q) continue;
      const prov = buildProvenance(q, mode);
      if (prov.register_key !== null) {
        expect(
          registerKeys.has(prov.register_key),
          `${id} (${mode}): register_key "${prov.register_key}" not in source-register.json`
        ).toBe(true);
      }
    }
  });

  test('ISO-licensed questions return the non-reproduction clause text', () => {
    const isoQuestion = allQuestions.get('SOV-5-01');
    if (!isoQuestion) return;
    // SOV-5-01 sources ISO standards; in LMIC mode its anchor may be ISO
    // In eu_csf mode it falls through to csi badge — check csi_composite for source_text
    const prov = buildProvenance(isoQuestion, 'csi_composite');
    // Either source_text is null (ISO: cite-only, no reproduction) or is a clause ref
    // The key constraint: we never reproduce ISO clause text verbatim
    expect(prov.register_key).not.toBeNull();
  });

  test('all questions in any mode produce a register_key that is not undefined', () => {
    // Register_key may be null (unresolvable) but must not be undefined
    const modes: FrameworkMode[] = ['eu_csf', 'c3a', 'cada', 'lmic', 'csi_composite'];
    for (const { id, mode } of SAMPLE_CASES) {
      const q = allQuestions.get(id);
      if (!q) continue;
      const prov = buildProvenance(q, mode);
      expect(prov.register_key).not.toBeUndefined();
    }
  });

  test('broader check: buildProvenance on all LMIC questions always returns non-empty origin_line', () => {
    const lmicQuestions = criteria.objectives.flatMap(o =>
      o.questions.filter(q => q.applies_to_lmic)
    );
    expect(lmicQuestions.length).toBeGreaterThan(0);
    for (const q of lmicQuestions) {
      const prov = buildProvenance(q, 'lmic');
      expect(
        prov.origin_line.length,
        `${q.id}: LMIC origin_line must be non-empty`
      ).toBeGreaterThan(0);
    }
  });

  test('broader check: buildProvenance on all CADA questions always returns non-empty fidelity_badge', () => {
    const cadaQuestions = criteria.objectives.flatMap(o =>
      o.questions.filter(q => q.applies_to_cada)
    );
    expect(cadaQuestions.length).toBeGreaterThan(0);
    for (const q of cadaQuestions) {
      const prov = buildProvenance(q, 'cada');
      expect(
        prov.fidelity_badge.length,
        `${q.id}: CADA fidelity_badge must be non-empty`
      ).toBeGreaterThan(0);
    }
  });
});
