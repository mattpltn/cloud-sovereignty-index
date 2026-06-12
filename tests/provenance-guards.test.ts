import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import sourceRegisterJson from '../data/source-register.json';
import type { CriteriaFile, FrameworkMode } from '../shared/src/schema';
import { buildProvenance, resolveRegisterKey } from '@shared/provenance';

const criteria = criteriaJson as unknown as CriteriaFile;
const sourceRegister = sourceRegisterJson as {
  entries: Array<{ key: string; license_posture: string; proposal_disclaimer?: boolean }>;
};

const registerKeys = new Set(sourceRegister.entries.map(e => e.key));

const MODES: FrameworkMode[] = ['eu_csf', 'c3a', 'csi_composite', 'cada', 'lmic'];

describe('provenance-guards', () => {

  test('source-register: CADA entry has proposal_disclaimer: true', () => {
    const cada = sourceRegister.entries.find(e => e.key === 'cada');
    expect(cada, 'CADA entry missing from register').toBeDefined();
    expect(cada!.proposal_disclaimer).toBe(true);
  });

  test('source-register: no ISO entry has license_posture quotable', () => {
    for (const entry of sourceRegister.entries) {
      if (entry.key.startsWith('iso-')) {
        expect(entry.license_posture, `${entry.key} must be cite-only`).toBe('cite-only');
      }
    }
  });

  test('buildProvenance returns non-empty SourceBlock for every EU-CSF question', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (!q.applies_to_eu_csf) continue;
        const sb = buildProvenance(q, 'eu_csf');
        expect(sb.fidelity_badge, `${q.id} eu_csf: missing fidelity_badge`).toBeTruthy();
        expect(sb.origin_line, `${q.id} eu_csf: missing origin_line`).toBeTruthy();
      }
    }
  });

  test('buildProvenance returns non-empty SourceBlock for every C3A question', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (!q.applies_to_c3a) continue;
        const sb = buildProvenance(q, 'c3a');
        expect(sb.fidelity_badge, `${q.id} c3a: missing fidelity_badge`).toBeTruthy();
        expect(sb.origin_line, `${q.id} c3a: missing origin_line`).toBeTruthy();
      }
    }
  });

  test('buildProvenance returns non-empty SourceBlock for every CADA question', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (!q.applies_to_cada) continue;
        const sb = buildProvenance(q, 'cada');
        expect(sb.fidelity_badge, `${q.id} cada: missing fidelity_badge`).toBeTruthy();
        expect(sb.origin_line, `${q.id} cada: missing origin_line`).toBeTruthy();
      }
    }
  });

  test('buildProvenance returns non-empty SourceBlock for every LMIC question', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (!q.applies_to_lmic) continue;
        const sb = buildProvenance(q, 'lmic');
        expect(sb.fidelity_badge, `${q.id} lmic: missing fidelity_badge`).toBeTruthy();
        expect(sb.origin_line, `${q.id} lmic: missing origin_line`).toBeTruthy();
      }
    }
  });

  test('direct fidelity questions have non-null source_text or a valid register_key', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        for (const mode of MODES) {
          const applies =
            (mode === 'eu_csf' && q.applies_to_eu_csf) ||
            (mode === 'c3a' && q.applies_to_c3a) ||
            (mode === 'cada' && q.applies_to_cada) ||
            (mode === 'lmic' && q.applies_to_lmic);
          if (!applies) continue;

          const fidelity =
            mode === 'eu_csf' ? q.eu_csf_fidelity :
            mode === 'c3a' ? q.c3a_fidelity :
            mode === 'cada' ? q.cada_fidelity :
            q.lmic_sourcing;

          if (fidelity !== 'direct' && fidelity !== 'grounded-new') continue;

          const sb = buildProvenance(q, mode);
          const hasSource = sb.source_text !== null || sb.register_key !== null;
          expect(hasSource, `${q.id} (${mode}, ${fidelity}): missing both source_text and register_key`).toBe(true);
        }
      }
    }
  });

  test('every lmic_anchor framework string resolves to a register key', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        for (const a of (q as any).lmic_anchors ?? []) {
          const key = resolveRegisterKey(a.framework);
          expect(key, `unresolved anchor framework "${a.framework}" on ${q.id}`).not.toBeNull();
          expect(registerKeys.has(key!), `register key "${key}" missing from source-register.json (${q.id})`).toBe(true);
        }
      }
    }
  });

  test('origin-line templates match fidelity badge for each class', () => {
    // Find one question per fidelity class and verify template
    const directEuCsf = criteria.objectives.flatMap(o => o.questions)
      .find(q => q.eu_csf_fidelity === 'direct' && q.applies_to_eu_csf);
    if (directEuCsf) {
      const sb = buildProvenance(directEuCsf, 'eu_csf');
      expect(sb.origin_line).toMatch(/This question comes from/);
    }

    const inferredEuCsf = criteria.objectives.flatMap(o => o.questions)
      .find(q => q.eu_csf_fidelity === 'inferred' && q.applies_to_eu_csf);
    if (inferredEuCsf) {
      const sb = buildProvenance(inferredEuCsf, 'eu_csf');
      expect(sb.origin_line).toMatch(/This question is derived from/);
    }

    const groundedNew = criteria.objectives.flatMap(o => o.questions)
      .find(q => q.lmic_sourcing === 'grounded-new' && q.applies_to_lmic);
    if (groundedNew) {
      const sb = buildProvenance(groundedNew, 'lmic');
      expect(sb.origin_line).toMatch(/No single framework contains this control/);
    }

    const adapt = criteria.objectives.flatMap(o => o.questions)
      .find(q => q.lmic_sourcing === 'adapt' && q.applies_to_lmic);
    if (adapt) {
      const sb = buildProvenance(adapt, 'lmic');
      expect(sb.origin_line).toMatch(/This question adapts/);
    }

    const editorial = criteria.objectives.flatMap(o => o.questions)
      .find(q => q.lmic_sourcing === 'editorial' && q.applies_to_lmic);
    if (editorial) {
      const sb = buildProvenance(editorial, 'lmic');
      expect(sb.origin_line).toMatch(/editorial operationalization/);
    }
  });

});
