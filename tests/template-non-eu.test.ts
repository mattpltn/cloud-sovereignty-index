import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, Question } from '../shared/src/schema';
import { displayTitle } from '../shared/src/tier-resolution';
import { generalizedFor } from '../src/lib/template-xlsx';

// The blank XLSX template is the THIRD presentation path (after the questionnaire and the
// result/report). It must agree with the others: the rows a NON-EU filler actually answers must
// carry the adapted, jurisdiction-neutral wording — never EU-native phrasing. This test
// replicates the template's exact row resolution (see buildTemplateXlsx) for every CSI question
// and asserts the non-EU-visible title and text are EU-free — locking the third path against a
// regression (e.g. reverting a row back to q.title / q.text).
const criteria = criteriaJson as unknown as CriteriaFile;
const EU_TOKEN = /\bEU\b|\bEEA\b|member state|non-EU|European/;
const csiQ = criteria.objectives.flatMap(o => o.questions).filter(
  q => (q as { applies_to_csi_composite?: boolean }).applies_to_csi_composite
) as Question[];

// The (title, text) a non-EU filler sees for a question, mirroring buildTemplateXlsx:
//  - single, excluded → not presented (the EU row greys out) → nothing to check
//  - single, has generalized → the 'generalized' row: displayTitle + non_eu/text_generalized
//  - single, plain → the 'single' row: q.title + q.text (already neutral)
//  - tiered → the 'national' row (bloc greys out for non-EU): displayTitle + (non_eu ?? national tier)
function nonEuRow(q: Question): { title: string; text: string } | null {
  const gen = generalizedFor(q);
  if (q.type === 'single') {
    if (gen.excluded) return null;
    if (gen.text) return { title: displayTitle(q, 'Generalized'), text: gen.text };
    return { title: q.title, text: (q as { text: string }).text };
  }
  if (q.type === 'tiered') {
    const tiers = (q as { tiers: { national?: { text: string }; bloc: { text: string } } }).tiers;
    const natText = tiers.national?.text ?? tiers.bloc.text;
    return { title: displayTitle(q, 'Generalized'), text: gen.text ?? natText };
  }
  return null;
}

describe('blank XLSX template — non-EU rows are EU-free', () => {
  test('every CSI question presents EU-free title and text to a non-EU filler', () => {
    expect(csiQ.length).toBeGreaterThan(0);
    const bleeders: string[] = [];
    for (const q of csiQ) {
      const row = nonEuRow(q);
      if (!row) continue;
      if (EU_TOKEN.test(row.title)) bleeders.push(`${q.id} TITLE: ${row.title}`);
      if (EU_TOKEN.test(row.text)) bleeders.push(`${q.id} TEXT: ${row.text.slice(0, 80)}`);
    }
    expect(bleeders, `non-EU template rows leaking EU wording:\n${bleeders.join('\n')}`).toEqual([]);
  });
});
