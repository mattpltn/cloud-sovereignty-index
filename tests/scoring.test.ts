import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scoreAssessment } from '@shared/scoring';
import type { CriteriaFile } from '@shared/schema';
import type { AnswerMap } from '@shared/types';

const criteria: CriteriaFile = JSON.parse(
  readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf-8')
);

const meta = {
  variant: 'EU-CSF' as const,
  scope_ids: ['IaaS'],
  role: 'customer',
  instrument_version: '1.0',
};

function allYesAnswers(tier: 'bloc' | 'national'): AnswerMap {
  const map: AnswerMap = {};
  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (q.type === 'single') {
        map[q.id] = { tier: 'single', value: 'yes' };
      } else {
        // Use the tiered key format
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

describe('scoreAssessment', () => {
  it('perfect assessment (national yes) → 100%', () => {
    const answers = allYesAnswers('national');
    const result = scoreAssessment(answers, criteria, 'test-1', meta);
    expect(result.overall_score).toBeCloseTo(100, 1);
  });

  it('perfect assessment (bloc yes) → 100%', () => {
    const answers = allYesAnswers('bloc');
    const result = scoreAssessment(answers, criteria, 'test-1b', meta);
    expect(result.overall_score).toBeCloseTo(100, 1);
  });

  it('zero assessment → 0%, SEAL = 0 for all objectives', () => {
    const answers = allNoAnswers();
    const result = scoreAssessment(answers, criteria, 'test-2', meta);
    expect(result.overall_score).toBeCloseTo(0, 1);
    for (const obj of result.objectives) {
      expect(obj.seal_level).toBe(0);
    }
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
    const result = scoreAssessment(answers, criteria, 'test-3', meta);
    const sov1 = result.objectives.find(o => o.objective_id === 'SOV-1')!;
    expect(sov1.raw_score).toBeGreaterThan(0);
    // bloc sc=1 for SOV-1-01/02, sc=3 for SOV-1-03, single sc=2 for SOV-1-04
    // All bloc=yes, single=yes → SEAL=2 (sc<=2: bloc SOV-1-01 yes, SOV-1-02 yes, single yes; sc<=3: SOV-1-03 yes → SEAL 3)
    expect(sov1.seal_level).toBeGreaterThanOrEqual(1);
  });

  it('national yes → auto-satisfies bloc tier for SEAL', () => {
    const answers: AnswerMap = {
      'SOV-1-01:national': { tier: 'national', value: 'yes' },
      'SOV-1-02:national': { tier: 'national', value: 'yes' },
      'SOV-1-03:national': { tier: 'national', value: 'yes' },
      'SOV-1-04': { tier: 'single', value: 'yes' },
    };
    const result = scoreAssessment(answers, criteria, 'test-4', meta);
    const sov1 = result.objectives.find(o => o.objective_id === 'SOV-1')!;
    // national sc=2,2,4 + single sc=2 → all sc<=4 satisfied → SEAL 4
    expect(sov1.seal_level).toBe(4);
  });

  it('one failed SEAL-1 criterion drops objective SEAL to 0', () => {
    const answers = allYesAnswers('bloc');
    // SOV-1-01 bloc has seal_contribution=1
    answers['SOV-1-01:bloc'] = { tier: 'bloc', value: 'no' };
    delete answers['SOV-1-01:national'];
    const result = scoreAssessment(answers, criteria, 'test-5', meta);
    const sov1 = result.objectives.find(o => o.objective_id === 'SOV-1')!;
    expect(sov1.seal_level).toBe(0);
  });

  it('gap report is sorted by gap_score descending', () => {
    const answers = allNoAnswers();
    const result = scoreAssessment(answers, criteria, 'test-6', meta);
    for (let i = 1; i < result.gap_report.length; i++) {
      expect(result.gap_report[i - 1].gap_score).toBeGreaterThanOrEqual(result.gap_report[i].gap_score);
    }
  });

  it('n/a answers excluded from score and SEAL', () => {
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
    const result = scoreAssessment(map, criteria, 'test-7', meta);
    expect(result.overall_score).toBe(0);
  });
});
