import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, Question } from '../shared/src/schema';

// Closure invariant for the presentation layer: in CSI-only mode for a NON-EU country, no
// question that is shown/scored may render EU-native wording ("EU", "EEA", "member state",
// "non-EU", "European Union"). The questionnaire and the result/report path must agree — a
// question adapted in the form but shown raw in the report is a defect (CLAUDE.md: "two
// parallel paths must agree"). This test takes the complement: it asserts that the text a
// non-EU user would see is clean for EVERY CSI-applicable question, so the next residency/EU
// criterion added without a non_eu variant fails here loudly.
const criteria = criteriaJson as unknown as CriteriaFile;
const EU_TOKEN = /\bEU\b|\bEEA\b|member state|non-EU|European Union/;

// The text a non-EU CSI user sees: the csi_presentation.non_eu variant when present & shown,
// otherwise the native question/tier text. Mirrors resolvePresentation + gapDetail + report-pdf.
function nonEuTexts(q: Question): string[] {
  const pres = (q as { csi_presentation?: { variants?: { non_eu?: { shown?: boolean; text?: string } } } }).csi_presentation;
  const nonEu = pres?.variants?.non_eu;
  if (nonEu) {
    if (nonEu.shown === false) return []; // excluded from non-EU mode → nothing rendered
    return typeof nonEu.text === 'string' ? [nonEu.text] : [];
  }
  // No presentation block: native text(s) are used verbatim for non-EU users.
  const out: string[] = [];
  if (typeof (q as { text?: string }).text === 'string') out.push((q as { text: string }).text);
  const tiers = (q as { tiers?: Record<string, { text?: string }> }).tiers;
  if (tiers) for (const t of Object.values(tiers)) if (typeof t?.text === 'string') out.push(t.text);
  return out;
}

describe('non-EU presentation has no EU bleed', () => {
  test('every CSI-applicable question renders EU-free text for a non-EU country', () => {
    const csiQ = criteria.objectives.flatMap(o => o.questions).filter(q => (q as { applies_to_csi_composite?: boolean }).applies_to_csi_composite) as Question[];
    expect(csiQ.length).toBeGreaterThan(0);
    const bleeders = csiQ.filter(q => nonEuTexts(q).some(t => EU_TOKEN.test(t)))
      .map(q => `${q.id} ("${q.title}")`);
    expect(bleeders, `these CSI questions leak EU wording to a non-EU user — add a csi_presentation.non_eu variant:\n${bleeders.join('\n')}`).toEqual([]);
  });
});
