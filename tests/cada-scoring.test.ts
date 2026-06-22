import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scoreAssessment } from '@shared/scoring';
import { mergeStructuralAnswers, STRUCTURAL_QUESTION_IDS } from '@shared/structural-answers';
import type { CriteriaFile, ControlProfile } from '@shared/schema';
import type { AnswerMap } from '@shared/types';

const criteria: CriteriaFile = JSON.parse(
  readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf-8')
);

const metaCada = {
  variant: 'EU-CSF' as const,
  scope_ids: ['IaaS'],
  role: 'customer',
  instrument_version: '2.0',
  selected_frameworks: ['cada'],
};

// A fully sovereign, in-country, self-operated profile (the "good" EU case).
const IN_COUNTRY: ControlProfile = (['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const).reduce(
  (acc, L) => { acc[L] = { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' }; return acc; },
  {} as ControlProfile,
);

// A foreign hyperscaler with no local entity / infrastructure (Algeria gov on AWS).
const FOREIGN: ControlProfile = (['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const).reduce(
  (acc, L) => { acc[L] = { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' }; return acc; },
  {} as ControlProfile,
);

const STRUCTURAL = new Set(STRUCTURAL_QUESTION_IDS);

/** Answer every CADA question 'yes' (both tiers for tiered questions). */
function cadaAllYes(): AnswerMap {
  const map: AnswerMap = {};
  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (!(q as any).applies_to_cada) continue;
      if (q.type === 'tiered') {
        map[`${q.id}:national`] = { tier: 'national', value: 'yes' };
        map[`${q.id}:bloc`] = { tier: 'bloc', value: 'yes' };
      } else {
        map[q.id] = { tier: 'single', value: 'yes' };
      }
    }
  }
  return map;
}

/** Drop structural (auto-answered) questions so the profile fills them, as in the real flow. */
function dropStructural(map: AnswerMap): AnswerMap {
  const out = { ...map };
  for (const id of STRUCTURAL) { delete out[id]; delete out[`${id}:national`]; delete out[`${id}:bloc`]; }
  return out;
}

describe('CADA scoring', () => {
  it('in-country profile, every visible question answered yes → UAL 4 (the all-compliant bug is fixed)', () => {
    const merged = mergeStructuralAnswers(cadaAllYes(), IN_COUNTRY, criteria);
    const r = scoreAssessment(merged, criteria, 'cada-incountry', { ...metaCada, control_profile: IN_COUNTRY });
    expect(r.cada!.highest_level_achieved).toBe(4);
  });

  it('a question hidden for the profile never gates (excluded, not counted as a failure)', () => {
    // SOV-2-05 only shows when a layer is non-domestic; for the in-country profile its
    // show_when is false. Leaving it unanswered must NOT pin the result below UAL 4.
    const answers = cadaAllYes();
    delete answers['SOV-2-05:national']; delete answers['SOV-2-05:bloc']; delete answers['SOV-2-05'];
    const merged = mergeStructuralAnswers(answers, IN_COUNTRY, criteria);
    const r = scoreAssessment(merged, criteria, 'cada-hidden', { ...metaCada, control_profile: IN_COUNTRY });
    expect(r.cada!.highest_level_achieved).toBe(4);
  });

  it('applicability_condition excludes a question when its dependency is unmet', () => {
    // SOV-2-07-CADA applies only when SOV-1-03 == 'no'. For the in-country profile SOV-1-03
    // resolves 'yes', so a 'no' on SOV-2-07-CADA must be excluded and not block Level 2.
    const answers = cadaAllYes();
    answers['SOV-2-07-CADA'] = { tier: 'single', value: 'no' };
    const merged = mergeStructuralAnswers(answers, IN_COUNTRY, criteria);
    const r = scoreAssessment(merged, criteria, 'cada-applic', { ...metaCada, control_profile: IN_COUNTRY });
    expect(r.cada!.highest_level_achieved).toBe(4);
  });

  it('foreign hyperscaler fails CADA honestly (in-country facts auto-resolve no) — not a spurious low score', () => {
    const merged = mergeStructuralAnswers(dropStructural(cadaAllYes()), FOREIGN, criteria);
    const r = scoreAssessment(merged, criteria, 'cada-foreign', { ...metaCada, control_profile: FOREIGN });
    expect(r.cada!.highest_level_achieved).toBe(0);
  });
});
