import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scoreAssessment } from '@shared/scoring';
import type { CriteriaFile } from '@shared/schema';
import type { AnswerMap } from '@shared/types';

const criteria: CriteriaFile = JSON.parse(
  readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf-8')
);

const metaComposite = {
  variant: 'EU-CSF' as const,
  scope_ids: ['IaaS'],
  role: 'customer',
  instrument_version: '2.0',
  selected_frameworks: ['csi_composite'],
};

const metaEuCsf = { ...metaComposite, selected_frameworks: ['eu_csf'] };
const metaC3a = { ...metaComposite, selected_frameworks: ['c3a'] };
const metaAll = { ...metaComposite, selected_frameworks: ['eu_csf', 'c3a', 'csi_composite'] };

function allYesAnswers(tier: 'bloc' | 'national'): AnswerMap {
  const map: AnswerMap = {};
  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (q.type === 'single') {
        map[q.id] = { tier: 'single', value: 'yes' };
      } else {
        map[`${q.id}:${tier}`] = { tier, value: 'yes' };
      }
    }
  }
  return map;
}

function allNoAnswers(): AnswerMap {
  const map: AnswerMap = {};
  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (q.type === 'single') {
        map[q.id] = { tier: 'single', value: 'no' };
      } else {
        map[`${q.id}:national`] = { tier: 'national', value: 'no' };
        map[`${q.id}:bloc`] = { tier: 'bloc', value: 'no' };
      }
    }
  }
  return map;
}

// ── CSI Composite mode (existing behavior preserved) ──────────────────────────

describe('CSI Composite mode', () => {
  it('perfect assessment (national yes) → 100%', () => {
    const result = scoreAssessment(allYesAnswers('national'), criteria, 'test-1', metaComposite);
    expect(result.csi_composite!.global.pct).toBeCloseTo(100, 1);
  });

  it('perfect assessment (bloc yes) → 100%', () => {
    const result = scoreAssessment(allYesAnswers('bloc'), criteria, 'test-1b', metaComposite);
    expect(result.csi_composite!.global.pct).toBeCloseTo(100, 1);
  });

  it('zero assessment → 0%, CSL = 0 for all objectives', () => {
    const result = scoreAssessment(allNoAnswers(), criteria, 'test-2', metaComposite);
    expect(result.csi_composite!.global.pct).toBeCloseTo(0, 1);
    for (const obj of Object.values(result.csi_composite!.per_objective)) {
      expect(obj.csl).toBe(0);
    }
  });

  // Helper: flip one objective's questions to 'no' on an otherwise all-yes sheet.
  function allYesExcept(objId: string): AnswerMap {
    const map = allYesAnswers('national');
    const obj = criteria.objectives.find(o => o.id === objId)!;
    for (const q of obj.questions) {
      if (q.type === 'single') map[q.id] = { tier: 'single', value: 'no' };
      else { map[`${q.id}:national`] = { tier: 'national', value: 'no' }; map[`${q.id}:bloc`] = { tier: 'bloc', value: 'no' }; }
    }
    return map;
  }

  const metaGen = { ...metaComposite, variant: 'Generalized' as const };

  it('weakest-link gate (Generalized): a CSL-0 sovereignty domain caps the headline despite high coverage', () => {
    const result = scoreAssessment(allYesExcept('SOV-6'), criteria, 'test-gate', metaGen);
    const g = result.csi_composite!.global;
    expect(result.csi_composite!.per_objective['SOV-6'].csl).toBe(0);
    expect(g.pct).toBeGreaterThan(70);            // coverage stays high
    expect(g.weakest_link_csl).toBe(0);
    expect(g.gating_objective_ids).toContain('SOV-6');
    expect(g.csl).toBe(0);                         // headline gated to the weakest link
    expect(g.maturity_tier).toBe('dependent');
  });

  it('SOV-8 (ESG) does NOT gate the headline even at CSL 0', () => {
    const result = scoreAssessment(allYesExcept('SOV-8'), criteria, 'test-esg', metaGen);
    const g = result.csi_composite!.global;
    expect(result.csi_composite!.per_objective['SOV-8'].csl).toBe(0);
    expect(g.gating_objective_ids).not.toContain('SOV-8');
    expect(g.csl).toBeGreaterThan(0);              // environmental never gates sovereignty
  });

  it('national no + bloc yes → scores at bloc level', () => {
    const answers: AnswerMap = {
      'SOV-1-01:national': { tier: 'national', value: 'no' },
      'SOV-1-01:bloc': { tier: 'bloc', value: 'yes' },
      'SOV-1-02:national': { tier: 'national', value: 'no' },
      'SOV-1-02:bloc': { tier: 'bloc', value: 'yes' },
      'SOV-1-03:national': { tier: 'national', value: 'no' },
      'SOV-1-03:bloc': { tier: 'bloc', value: 'yes' },
      'SOV-1-04': { tier: 'single', value: 'yes' },
    };
    const result = scoreAssessment(answers, criteria, 'test-3', metaComposite);
    const sov1 = result.csi_composite!.per_objective['SOV-1'];
    expect(sov1.raw_score).toBeGreaterThan(0);
    expect(sov1.csl).toBeGreaterThanOrEqual(1);
  });

  it('national yes → auto-satisfies bloc tier for CSL', () => {
    const answers: AnswerMap = {
      'SOV-1-01:national': { tier: 'national', value: 'yes' },
      'SOV-1-02:national': { tier: 'national', value: 'yes' },
      'SOV-1-03:national': { tier: 'national', value: 'yes' },
      'SOV-1-04': { tier: 'single', value: 'yes' },
    };
    const result = scoreAssessment(answers, criteria, 'test-4', metaComposite);
    const sov1 = result.csi_composite!.per_objective['SOV-1'];
    expect(sov1.csl).toBe(4);
  });

  it('one failed SEAL-1 criterion drops objective CSL to 0', () => {
    const answers = allYesAnswers('bloc');
    answers['SOV-1-01:bloc'] = { tier: 'bloc', value: 'no' };
    delete answers['SOV-1-01:national'];
    const result = scoreAssessment(answers, criteria, 'test-5', metaComposite);
    const sov1 = result.csi_composite!.per_objective['SOV-1'];
    expect(sov1.csl).toBe(0);
  });

  it('gap report is sorted by gap_score descending', () => {
    const result = scoreAssessment(allNoAnswers(), criteria, 'test-6', metaComposite);
    const gaps = result.csi_composite!.gap_report;
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].gap_score).toBeGreaterThanOrEqual(gaps[i].gap_score);
    }
  });

  it('n/a answers excluded from score and CSL', () => {
    const map: AnswerMap = {};
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (q.type === 'single') map[q.id] = { tier: 'single', value: 'n/a' };
        else {
          map[`${q.id}:national`] = { tier: 'national', value: 'n/a' };
          map[`${q.id}:bloc`] = { tier: 'bloc', value: 'n/a' };
        }
      }
    }
    const result = scoreAssessment(map, criteria, 'test-7', metaComposite);
    expect(result.csi_composite!.global.pct).toBe(0);
  });
});

// ── EU-CSF mode ───────────────────────────────────────────────────────────────

describe('EU-CSF mode', () => {
  it('produces eu_csf result, no c3a or csi_composite', () => {
    const result = scoreAssessment(allYesAnswers('bloc'), criteria, 'test-eu-1', metaEuCsf);
    expect(result.eu_csf).toBeDefined();
    expect(result.c3a).toBeUndefined();
    expect(result.csi_composite).toBeUndefined();
  });

  it('perfect assessment → SEAL 4 globally', () => {
    const answers = allYesAnswers('national');
    const result = scoreAssessment(answers, criteria, 'test-eu-2', metaEuCsf);
    expect(result.eu_csf!.global.seal).toBe(4);
    expect(result.eu_csf!.global.pct).toBeCloseTo(100, 1);
  });

  it('partial counts as half points but not toward SEAL gate', () => {
    const answers: AnswerMap = { 'SOV-1-04': { tier: 'single', value: 'partial' } };
    const result = scoreAssessment(answers, criteria, 'test-eu-3', metaEuCsf);
    const sov1 = result.eu_csf!.per_objective['SOV-1'];
    const qr = sov1.questions.find(q => q.question_id === 'SOV-1-04');
    expect(qr!.points_earned).toBeCloseTo(qr!.points_possible * 0.5, 5);
    expect(qr!.counts_toward_seal).toBe(false);
  });

  it('SOV-7 and SOV-8 questions are included in EU-CSF mode', () => {
    const result = scoreAssessment({}, criteria, 'test-eu-4', metaEuCsf);
    expect(result.eu_csf!.per_objective['SOV-7']).toBeDefined();
    expect(result.eu_csf!.per_objective['SOV-8']).toBeDefined();
  });
});

// ── C3A mode ──────────────────────────────────────────────────────────────────

describe('C3A mode', () => {
  it('produces c3a result, no eu_csf or csi_composite', () => {
    const result = scoreAssessment(allYesAnswers('bloc'), criteria, 'test-c3a-1', metaC3a);
    expect(result.c3a).toBeDefined();
    expect(result.eu_csf).toBeUndefined();
    expect(result.csi_composite).toBeUndefined();
  });

  it('SOV-7 and SOV-8 objectives are NOT included in C3A mode', () => {
    const result = scoreAssessment(allYesAnswers('bloc'), criteria, 'test-c3a-2', metaC3a);
    expect(result.c3a!.criterion.per_objective['SOV-7']).toBeDefined();
    // SOV-7 questions have applies_to_c3a = false so they should contribute 0 applicable
    expect(result.c3a!.criterion.per_objective['SOV-7'].applicable).toBe(0);
    expect(result.c3a!.criterion.per_objective['SOV-8']).toBeDefined();
    expect(result.c3a!.criterion.per_objective['SOV-8'].applicable).toBe(0);
  });

  it('partial counts as not-met in C3A mode', () => {
    const answers: AnswerMap = { 'SOV-1-04': { tier: 'single', value: 'partial' } };
    const result = scoreAssessment(answers, criteria, 'test-c3a-3', metaC3a);
    const sov1Criterion = result.c3a!.criterion.per_objective['SOV-1'];
    // SOV-1-04 is a base criterion: partial = not-met → passed = 0
    expect(sov1Criterion.passed).toBe(0);
  });

  it('AC criteria not in customer_selected_ac_ids are excluded from denominator', () => {
    const answers = allYesAnswers('bloc');
    // Don't select any ACs
    const result = scoreAssessment(answers, criteria, 'test-c3a-4', { ...metaC3a, customer_selected_ac_ids: [] });
    expect(result.c3a!.additional_criterion.global).toBeNull();
  });

  it('selected AC criteria appear in denominator', () => {
    const answers = allYesAnswers('bloc');
    answers['SOV-3-02-AC'] = { tier: 'single', value: 'yes' };
    const result = scoreAssessment(answers, criteria, 'test-c3a-5', {
      ...metaC3a,
      customer_selected_ac_ids: ['SOV-3-02-AC'],
    });
    expect(result.c3a!.additional_criterion.global).not.toBeNull();
    expect(result.c3a!.additional_criterion.global!.applicable).toBeGreaterThan(0);
  });

  it('all-yes assessment → 100% criterion, fully_attained, layer_a_blocked=false', () => {
    const answers = allYesAnswers('bloc');
    const result = scoreAssessment(answers, criteria, 'test-c3a-6', metaC3a);
    expect(result.c3a!.criterion.global.pct).toBe(100);
    expect(result.c3a!.criterion.global.attainment).toBe('fully_attained');
    expect(result.c3a!.layer_a_blocked).toBe(false);
  });

  it('per-objective results include attainment band', () => {
    const answers = allYesAnswers('bloc');
    const result = scoreAssessment(answers, criteria, 'test-c3a-7', metaC3a);
    const sov1 = result.c3a!.criterion.per_objective['SOV-1'];
    expect(sov1.attainment).toBeDefined();
    expect(['not_attained', 'partially_attained', 'substantially_attained', 'fully_attained']).toContain(sov1.attainment);
  });

  it('failing a Layer A criterion → layer_a_blocked=true, global attainment = not_attained', () => {
    // SOV-2-01 is a Layer A criterion; answer 'no'
    const answers = allYesAnswers('bloc');
    answers['SOV-2-01'] = { tier: 'single', value: 'no' };
    const result = scoreAssessment(answers, criteria, 'test-c3a-8', metaC3a);
    expect(result.c3a!.layer_a_blocked).toBe(true);
    expect(result.c3a!.criterion.global.attainment).toBe('not_attained');
  });

  it('n/a on a Layer A criterion does NOT trigger layer_a_blocked', () => {
    const answers = allYesAnswers('bloc');
    answers['SOV-2-01'] = { tier: 'single', value: 'n/a' };
    const result = scoreAssessment(answers, criteria, 'test-c3a-9', metaC3a);
    expect(result.c3a!.layer_a_blocked).toBe(false);
  });
});

// ── Multi-mode: same answers → 3 independent outputs ─────────────────────────

describe('Multi-mode scoring', () => {
  it('three modes produce independent results from same answers', () => {
    const answers = allYesAnswers('bloc');
    const result = scoreAssessment(answers, criteria, 'test-multi-1', metaAll);
    expect(result.eu_csf).toBeDefined();
    expect(result.c3a).toBeDefined();
    expect(result.csi_composite).toBeDefined();
    expect(result.selected_frameworks).toEqual(['eu_csf', 'c3a', 'csi_composite']);
  });

  it('EU-CSF and CSI Composite both reach global SEAL/CSL 4 on perfect all-national answers', () => {
    const answers = allYesAnswers('national');
    const result = scoreAssessment(answers, criteria, 'test-multi-2', metaAll);
    expect(result.eu_csf!.global.seal).toBe(4);
    expect(result.csi_composite!.global.csl).toBe(4);
    expect(result.c3a!.criterion.global.pct).toBe(100);
  });
});
