import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';
import { resolvePlaceholders } from '../shared/src/tier-resolution';

const criteria = criteriaJson as unknown as CriteriaFile;
const allQuestions = criteria.objectives.flatMap(o => o.questions);

// A country with all profile fields populated, for both variants.
const CTX_EU = { variant: 'EU-CSF' as const, country: { code: 'DE', name: 'Germany', adj: 'German', national_admin_label: 'the Federal Government', emergency_regime: 'state of emergency' } };
const CTX_GEN = { variant: 'Generalized' as const, country: { code: 'DZ', name: 'Algeria', adj: 'Algerian', national_admin_label: 'the Algerian Government', emergency_regime: 'state of emergency' } };

// Matches a leftover placeholder token: {{TOKEN}} or {token}.
const TOKEN = /\{\{?[a-zA-Z_]+\}?\}/g;

function textFields(q: any): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const push = (f: string, s?: string) => { if (typeof s === 'string') out.push([f, s]); };
  push('text', q.text); push('text_generalized', q.text_generalized); push('text_c3a', q.text_c3a);
  if (q.csi_presentation) {
    push('csiPres.title', q.csi_presentation.title);
    for (const [k, v] of Object.entries<any>(q.csi_presentation.variants ?? {})) push(`csiPres.${k}`, v?.text);
  }
  for (const [k, t] of Object.entries<any>(q.tiers ?? {})) { push(`tiers.${k}`, t?.text); push(`tiers.${k}.gen`, t?.text_generalized); }
  return out;
}

describe('placeholder resolution', () => {
  test('no question text contains an unresolved placeholder after resolution', () => {
    const leftovers: string[] = [];
    for (const q of allQuestions) {
      for (const [field, raw] of textFields(q)) {
        for (const ctx of [CTX_EU, CTX_GEN]) {
          const resolved = resolvePlaceholders(raw, ctx as any);
          const m = resolved.match(TOKEN);
          if (m) leftovers.push(`${(q as any).id} ${field}: ${m.join(', ')}`);
        }
      }
    }
    expect([...new Set(leftovers)]).toEqual([]);
  });
});
