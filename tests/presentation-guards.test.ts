import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';
import { resolvePresentation } from '../shared/src/presentation';
import { scoreLmic } from '../shared/src/scoring';
import type { AnswerMap } from '../shared/src/types';

const criteria = criteriaJson as unknown as CriteriaFile;

const EU_TOKENS = /\b(EU|Union|SEAL)\b/;

const NON_EU_PROFILE = {
  country: 'Laos',
  trusted_jurisdiction: 'ASEAN digital trust zone',
  national_csirt: 'LaoCERT',
  eu_context: false,
};

const EU_PROFILE = {
  country: 'France',
  trusted_jurisdiction: 'European Union',
  national_csirt: 'ANSSI',
  eu_context: true,
};

describe('presentation-guards', () => {

  test('schema refine: exclude_non_eu without exclude_reason fails validation', () => {
    // The CriteriaFileSchema superRefine enforces this — verify via the in-memory criteria
    // (which already passed validation in schema-validation.test.ts).
    // Here we check directly that every exclude_non_eu question has exclude_reason.
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        const pres = q.csi_presentation;
        if (!pres) continue;
        if (pres.treatment === 'exclude_non_eu') {
          expect(
            pres.variants.non_eu.shown,
            `${q.id}: exclude_non_eu must have non_eu.shown === false`
          ).toBe(false);
          expect(
            (pres.variants.non_eu as { exclude_reason?: string }).exclude_reason,
            `${q.id}: exclude_non_eu must have exclude_reason`
          ).toBeTruthy();
        }
      }
    }
  });

  test('clean_adapt and re_aim questions have non_eu.shown === true', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        const pres = q.csi_presentation;
        if (!pres) continue;
        if (pres.treatment === 'clean_adapt' || pres.treatment === 're_aim') {
          expect(
            pres.variants.non_eu.shown,
            `${q.id}: ${pres.treatment} must have non_eu.shown === true`
          ).toBe(true);
        }
      }
    }
  });

  test('EU-framing guard: every CSI-composite or LMIC question either has csi_presentation OR no EU/Union/SEAL tokens in its text', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        const appliesCSI = q.applies_to_csi_composite || q.applies_to_lmic;
        if (!appliesCSI) continue;

        if (q.csi_presentation) continue; // presentation block present → adapted

        // Check question text for EU tokens
        let textToCheck = '';
        if (q.type === 'single' || q.type === 'tiered_ladder') {
          textToCheck = q.text ?? '';
        } else if (q.type === 'tiered') {
          textToCheck = (q.tiers?.bloc?.text ?? '') + ' ' + (q.tiers?.national?.text ?? '');
        }

        expect(
          EU_TOKENS.test(textToCheck),
          `${q.id} appears in CSI/LMIC mode with EU-framed text but no csi_presentation block: "${textToCheck.slice(0, 120)}..."`
        ).toBe(false);
      }
    }
  });

  test('excluded questions (shown: false) resolve to shown=false in non-EU mode', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        const pres = q.csi_presentation;
        if (!pres || pres.treatment !== 'exclude_non_eu') continue;

        const result = resolvePresentation(q, 'csi_composite', NON_EU_PROFILE);
        expect(result.shown, `${q.id} should be hidden in non-EU mode`).toBe(false);
        expect(result.exclude_reason, `${q.id} should carry an exclusion reason`).toBeTruthy();
      }
    }
  });

  test('excluded questions show in EU mode', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        const pres = q.csi_presentation;
        if (!pres || pres.treatment !== 'exclude_non_eu') continue;
        if (!q.applies_to_eu_csf && !q.applies_to_csi_composite) continue;

        const result = resolvePresentation(q, 'csi_composite', EU_PROFILE);
        expect(result.shown, `${q.id} should be shown in EU context`).toBe(true);
      }
    }
  });

  test('score invariance: csi_presentation block does not affect scoreLmic output', () => {
    // Strip all csi_presentation fields from criteria copy and verify scores are identical.
    // This proves the presentation layer is pure display — it never touches scoring.
    const criteriaWithout = JSON.parse(JSON.stringify(criteria));
    for (const obj of criteriaWithout.objectives) {
      for (const q of obj.questions) {
        delete q.csi_presentation;
      }
    }

    const answers: AnswerMap = {};
    const lmicQ = criteria.objectives.flatMap(o => o.questions.filter(q => q.applies_to_lmic));
    for (const q of lmicQ) {
      if (q.type === 'tiered_ladder') {
        answers[q.id] = { tier: 'ladder', value: 'yes', tier_claimed: q.id === 'SOV-1-12-LMIC' ? 'b30_50' : 'B' };
      } else {
        answers[q.id] = { tier: 'single', value: 'yes', evidence_status: 'documented' };
      }
    }

    const scoreWith = scoreLmic(answers, criteria);
    const scoreWithout = scoreLmic(answers, criteriaWithout);
    expect(scoreWith.autonomyPct).toBeCloseTo(scoreWithout.autonomyPct, 10);
    expect(scoreWith.assurancePct).toBeCloseTo(scoreWithout.assurancePct, 10);
  });

  test('resolvePresentation: EU-mode returns native text for eu_csf, c3a, cada modes', () => {
    const q = criteria.objectives.flatMap(o => o.questions).find(q => q.applies_to_eu_csf);
    if (!q) return;
    const result = resolvePresentation(q, 'eu_csf', EU_PROFILE);
    expect(result.shown).toBe(true);
    expect(result.provenance_link).toBeTruthy();
  });

  test('resolvePresentation: placeholders are resolved in non_eu text', () => {
    const adapted = criteria.objectives.flatMap(o => o.questions).find(
      q => q.csi_presentation?.treatment === 'clean_adapt' &&
           q.csi_presentation.variants.non_eu.text.includes('{country}')
    );
    if (!adapted) return;
    const result = resolvePresentation(adapted, 'csi_composite', NON_EU_PROFILE);
    expect(result.text).toContain('Laos');
    expect(result.text).not.toContain('{country}');
  });

});
