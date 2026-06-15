import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';
import { lintPredicate } from '../shared/src/relevance';

const criteria = criteriaJson as unknown as CriteriaFile;
const allQuestions = criteria.objectives.flatMap(o => o.questions);

describe('relevance-lint (§1 data contract)', () => {
  test('every show_when predicate is well-formed and on-vocabulary', () => {
    const offences: string[] = [];
    for (const q of allQuestions) {
      const showWhen: string | undefined = (q as any).relevance?.show_when;
      if (!showWhen) continue;
      const errs = lintPredicate(showWhen);
      if (errs.length) offences.push(`${q.id}: ${errs.join('; ')}`);
    }
    expect(offences, offences.join('\n')).toEqual([]);
  });

  test('lint has teeth: flags off-vocabulary value, unknown facet, and unparseable input', () => {
    expect(lintPredicate("L3.ownership == 'landlord'")).toHaveLength(1); // off-vocab value
    expect(lintPredicate("L3.custody == 'client'")).toHaveLength(1);     // unknown facet
    expect(lintPredicate("L3.ownership === 'client'")).not.toHaveLength(0); // unparseable
    expect(lintPredicate("L3.ownership == 'provider' OR L4.dependency == 'licensed_supported'")).toEqual([]);
  });
});
