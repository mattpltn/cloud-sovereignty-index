import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile, LayerControl } from '../shared/src/schema';
import type { AnswerMap } from '../shared/src/types';
import {
  structuralAnswers, mergeStructuralAnswers, STRUCTURAL_QUESTION_IDS,
} from '../shared/src/structural-answers';
import { deriveControlProfile, togglesFromDefaults } from '../shared/src/scoping-derive';

const criteria = criteriaJson as unknown as CriteriaFile;
const csiIds = new Set(
  criteria.objectives.flatMap(o => o.questions).filter(q => q.applies_to_csi_composite).map(q => q.id)
);

const L = (o: any, op: any, dep: any, loc: any): LayerControl =>
  ({ ownership: o, operation: op, dependency: dep, location: loc });

const mixed: ControlProfile = {
  L1: L('client', 'client_staff', 'self_supported_oss', 'in_country'),
  L2: L('client', 'client_staff', 'self_supported_oss', 'in_country'),
  L3: L('client', 'client_staff', 'self_supported_oss', 'in_country'),
  L4: L('provider', 'provider', 'proprietary_inaccessible', 'foreign'),
  L5: L('provider', 'provider', 'proprietary_inaccessible', 'foreign'),
  L6: L('client', 'client_staff', 'self_supported_oss', 'in_country'),
};
const appliance: ControlProfile = {
  L1: L('client', 'client_staff', 'na', 'in_country'),
  L2: L('client', 'client_staff', 'na', 'in_country'),
  L3: L('client', 'client_staff', 'proprietary_inaccessible', 'in_country'),
  L4: L('client', 'client_staff', 'proprietary_inaccessible', 'in_country'),
  L5: L('client', 'client_staff', 'na', 'in_country'),
  L6: L('client', 'client_staff', 'self_supported_oss', 'in_country'),
};
const hyperscaler = deriveControlProfile(togglesFromDefaults('hyperscaler'));
const regional = deriveControlProfile(togglesFromDefaults('regional_csp'));

const val = (p: ControlProfile, qid: string) =>
  structuralAnswers(p).find(s => s.questionId === qid)?.value;

describe('structural auto-answers', () => {
  test('every mapped question is a real CSI-applicable question', () => {
    for (const id of STRUCTURAL_QUESTION_IDS) {
      expect(csiIds.has(id), `${id} must be a CSI question`).toBe(true);
    }
  });

  test('foreign hyperscaler: jurisdiction/residency/personnel are determined NO', () => {
    for (const id of ['SOV-1-01', 'SOV-1-02', 'SOV-1-03', 'SOV-3-01', 'SOV-4-01', 'SOV-4-04', 'SOV-4-13-CADA']) {
      expect(val(hyperscaler, id), `${id} should be no for a foreign CSP`).toBe('no');
    }
  });

  test('in-country deployments (regional CSP, sovereign appliance) are credited YES', () => {
    for (const p of [regional, appliance]) {
      for (const id of STRUCTURAL_QUESTION_IDS) {
        expect(val(p, id), `${id} should be yes for an in-country deployment`).toBe('yes');
      }
    }
  });

  test('mixed hybrid: a foreign PaaS/ops layer forces jurisdiction/residency NO even with an in-country facility', () => {
    // The deciding facts are at L4/L5 (foreign), not L1 (in-country) — the keying the
    // assessment flagged. Provider-jurisdiction, data residency and personnel are all NO.
    expect(val(mixed, 'SOV-1-01')).toBe('no');
    expect(val(mixed, 'SOV-3-01')).toBe('no'); // data on the foreign managed/PaaS layer
    expect(val(mixed, 'SOV-4-01')).toBe('no'); // foreign operations
  });

  test('every structural answer carries a non-empty reason', () => {
    for (const s of structuralAnswers(hyperscaler)) {
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  test('mergeStructuralAnswers: a manual answer overrides the derived default', () => {
    const manual: AnswerMap = { 'SOV-1-01:bloc': { tier: 'bloc', value: 'yes', evidence_status: 'demonstrated' } };
    const merged = mergeStructuralAnswers(manual, hyperscaler, criteria);
    // override preserved (yes), not overwritten by the derived 'no'
    expect(merged['SOV-1-01:bloc'].value).toBe('yes');
    expect(merged['SOV-1-01:bloc'].evidence_status).toBe('demonstrated');
    // a non-overridden structural answer is filled in
    expect(merged['SOV-3-01:bloc']?.value).toBe('no');
  });

  test('tiered answers merge at the :bloc key, singles at the bare id', () => {
    const sa = structuralAnswers(hyperscaler);
    expect(sa.find(s => s.questionId === 'SOV-1-01')!.answerKey).toBe('SOV-1-01:bloc');     // tiered
    expect(sa.find(s => s.questionId === 'SOV-4-13-CADA')!.answerKey).toBe('SOV-4-13-CADA'); // single
  });
});
