import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile, LayerControl, Question } from '../shared/src/schema';
import { STRUCTURAL_QUESTION_IDS, structuralAnswers, structuralDroppedIds } from '../shared/src/structural-answers';
import { actionOwnerForQuestion } from '../shared/src/action-owner';
import { deriveControlProfile, togglesFromDefaults } from '../shared/src/scoping-derive';

const criteria = criteriaJson as unknown as CriteriaFile;
const allQ = criteria.objectives.flatMap(o => o.questions) as Question[];
const flagged = allQ.filter(q => (q as { foreign_provider_precluded?: boolean }).foreign_provider_precluded === true);
const structural = new Set(STRUCTURAL_QUESTION_IDS);

// Profiles
const hyperscaler = deriveControlProfile(togglesFromDefaults('hyperscaler')); // provider foreign
const regional = deriveControlProfile(togglesFromDefaults('regional_csp'));   // provider in-country
const L = (loc: LayerControl['location']): LayerControl =>
  ({ ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: loc });
const allInCountry: ControlProfile = {
  L1: L('in_country'), L2: L('in_country'), L3: L('in_country'),
  L4: L('in_country'), L5: L('in_country'), L6: L('in_country'),
};

// In-country LOCATION wording in question text/tiers.
const LOCATION_MANDATE =
  /non-\{\{BLOC\}\}|\{\{BLOC\}\}[- ]based|exclusively within \{\{(?:BLOC|COUNTRY)\}\}|within \{\{(?:BLOC|COUNTRY)\}\}|in \{\{(?:BLOC|COUNTRY)\}\}/;
function textsOf(q: Question): string[] {
  const out: string[] = [];
  if (typeof (q as { text?: string }).text === 'string') out.push((q as { text: string }).text);
  const tiers = (q as { tiers?: Record<string, { text?: string }> }).tiers;
  if (tiers) for (const t of Object.values(tiers)) if (typeof t?.text === 'string') out.push(t.text);
  return out;
}

describe('foreign-provider-precluded criteria', () => {
  // Closure invariant: every in-country LOCATION mandate must be reconciled — either a pure
  // structural fact, or flagged foreign_provider_precluded. Catches a new residency criterion
  // added without wiring it into the auto-clear engine.
  test('every in-country location-mandate criterion is reconciled', () => {
    const offenders = allQ.filter(q => textsOf(q).some(t => LOCATION_MANDATE.test(t)));
    expect(offenders.length).toBeGreaterThan(0);
    for (const q of offenders) {
      const reconciled = structural.has(q.id) || (q as { foreign_provider_precluded?: boolean }).foreign_provider_precluded === true;
      expect(reconciled, `${q.id} ("${q.title}") is an in-country mandate but is neither structural nor flagged foreign_provider_precluded`).toBe(true);
    }
  });

  // The known jurisdiction-submission criteria a foreign provider cannot satisfy are flagged.
  test('jurisdiction-submission criteria are flagged', () => {
    for (const id of ['SOV-2-02', 'SOV-2-03', 'SOV-2-03-CSI', 'SOV-2-05', 'SOV-2-05-CADA']) {
      const q = allQ.find(x => x.id === id);
      expect(q, `${id} should exist`).toBeTruthy();
      expect((q as { foreign_provider_precluded?: boolean }).foreign_provider_precluded, `${id} must be flagged`).toBe(true);
    }
  });

  test('flagged criteria are auto-cleared (drop + silent NO + inherent) ONLY when the provider is foreign', () => {
    expect(flagged.length).toBeGreaterThan(0);
    const foreignAuto = new Map(structuralAnswers(hyperscaler, criteria).map(s => [s.questionId, s.value]));
    const foreignDrop = structuralDroppedIds(hyperscaler, criteria);
    const domesticDrop = structuralDroppedIds(regional, criteria);
    const domesticAuto = new Map(structuralAnswers(regional, criteria).map(s => [s.questionId, s.value]));
    for (const q of flagged) {
      // Foreign provider: auto-answered NO, dropped from the form, inherent in the report.
      expect(foreignAuto.get(q.id), `${q.id} auto NO for foreign`).toBe('no');
      expect(foreignDrop.has(q.id), `${q.id} dropped for foreign`).toBe(true);
      expect(actionOwnerForQuestion(q, hyperscaler), `${q.id} inherent for foreign`).toBe('inherent');
      // In-country provider: still asked, scored normally, not inherent.
      expect(domesticAuto.get(q.id), `${q.id} NOT auto for in-country`).toBeUndefined();
      expect(domesticDrop.has(q.id), `${q.id} NOT dropped for in-country`).toBe(false);
      expect(actionOwnerForQuestion(q, allInCountry), `${q.id} not inherent in-country`).not.toBe('inherent');
    }
  });

  test('the flag does not change ownership when no profile is available', () => {
    expect(actionOwnerForQuestion(flagged[0], null)).toBe('supplier');
  });

  test('auto-clear requires criteria to be supplied (questionnaire/worker pass it; bare facts do not)', () => {
    // Without criteria, only the pure-fact STRUCTURAL_MAP answers come back — no foreign-precluded.
    const bare = structuralAnswers(hyperscaler).map(s => s.questionId);
    expect(bare.some(id => flagged.some(f => f.id === id && !structural.has(id)))).toBe(false);
  });
});
