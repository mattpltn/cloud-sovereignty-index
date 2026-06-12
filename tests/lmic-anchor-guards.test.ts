import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';

const criteria = criteriaJson as unknown as CriteriaFile;

const BINDING_LAW_RE = /Data Act|DORA|Regulation \(EU\)|World Bank Procurement Regulations/;

const allLmicQuestions = criteria.objectives.flatMap(o =>
  o.questions.filter(q => q.applies_to_lmic)
);

describe('LMIC anchor guards', () => {

  test('every applies_to_lmic question has lmic_pillar and lmic_rationale', () => {
    for (const q of allLmicQuestions) {
      expect(q.lmic_pillar, `${q.id} missing lmic_pillar`).toBeDefined();
      expect(q.lmic_rationale, `${q.id} missing lmic_rationale`).toBeTruthy();
    }
  });

  test('every grounded-new question has ≥2 anchors OR ≥1 binding-law anchor', () => {
    for (const q of allLmicQuestions) {
      if (q.lmic_sourcing !== 'grounded-new') continue;
      const anchors = q.lmic_anchors ?? [];
      const hasBindingLaw = anchors.some(a => BINDING_LAW_RE.test(a.framework));
      const ok = anchors.length >= 2 || hasBindingLaw;
      expect(ok, `${q.id} (grounded-new) needs ≥2 anchors or ≥1 binding-law anchor; has ${anchors.length}`).toBe(true);
    }
  });

  test('every adapt question has lmic_anchors (cites parent control)', () => {
    for (const q of allLmicQuestions) {
      if (q.lmic_sourcing !== 'adapt') continue;
      const anchors = q.lmic_anchors ?? [];
      expect(anchors.length, `${q.id} (adapt) must cite its parent — lmic_anchors empty`).toBeGreaterThan(0);
    }
  });

  test('no HUMAN-VERIFY string in any criteria field', () => {
    const raw = JSON.stringify(criteria);
    const idx = raw.indexOf('HUMAN-VERIFY');
    expect(idx, 'Found HUMAN-VERIFY in criteria.json — resolve before shipping').toBe(-1);
  });

  test('SOV-9 questions are excluded from EU-CSF, C3A, and CADA', () => {
    const sov9 = criteria.objectives.find(o => o.id === 'SOV-9');
    expect(sov9).toBeDefined();
    for (const q of sov9!.questions) {
      expect(q.applies_to_eu_csf, `${q.id} must not apply to eu_csf`).toBe(false);
      expect(q.applies_to_c3a, `${q.id} must not apply to c3a`).toBe(false);
      expect(q.applies_to_cada, `${q.id} must not apply to cada`).toBe(false);
    }
  });

  test('all -LMIC suffix questions are excluded from EU-CSF, C3A, and CADA', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (!q.id.endsWith('-LMIC') && !q.id.match(/-EV\d+$/)) continue;
        expect(q.applies_to_eu_csf, `${q.id} must not apply to eu_csf`).toBe(false);
        expect(q.applies_to_c3a, `${q.id} must not apply to c3a`).toBe(false);
        expect(q.applies_to_cada, `${q.id} must not apply to cada`).toBe(false);
      }
    }
  });

  test('tiered_ladder questions have ≥2 ladder rungs and a defined default tier', () => {
    // SOV-5-08-LMIC uses A/B/C tiers; SOV-1-12-LMIC uses band labels (lt30/b30_50/b50_75/gt75)
    const BAND_LADDER_IDS = new Set(['SOV-1-12-LMIC']);
    const STAFF_BAND_TIERS = ['lt30', 'b30_50', 'b50_75', 'gt75'];
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (q.type !== 'tiered_ladder') continue;
        expect(q.ladder.length, `${q.id} ladder must have ≥2 rungs`).toBeGreaterThanOrEqual(2);
        const tiers = q.ladder.map(r => r.tier);
        if (BAND_LADDER_IDS.has(q.id)) {
          // Band-based ladders must include the floor band (lt30 = no credit, the default)
          expect(tiers, `${q.id} band ladder must include lt30`).toContain('lt30');
          for (const t of tiers) {
            expect(STAFF_BAND_TIERS, `${q.id} unknown band tier "${t}"`).toContain(t);
          }
        } else {
          // A/B/C ladders must include C as the default fallback tier
          expect(tiers, `${q.id} ladder must include tier C (default)`).toContain('C');
        }
      }
    }
  });

});
