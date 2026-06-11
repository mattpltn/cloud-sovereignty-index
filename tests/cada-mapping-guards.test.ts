import { describe, it, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';

type Q = { id: string; applies_to_cada?: boolean; cada_fidelity?: string; cada_annex_ref?: string; cada_fidelity_rationale?: string };
const allQuestions: Q[] = (criteriaJson.objectives as any[]).flatMap(o => o.questions);
const byId = Object.fromEntries(allQuestions.map(q => [q.id, q]));

describe('CADA mapping guards (Annex II fidelity)', () => {
  it('L2(f) has a direct question (SOV-3-09-CADA)', () => {
    const q = byId['SOV-3-09-CADA'];
    expect(q?.applies_to_cada).toBe(true);
    expect(q?.cada_fidelity).toBe('direct');
    expect(q?.cada_annex_ref).toMatch(/L2\(f\)/);
  });

  it('AI provenance questions are never tagged direct for CADA', () => {
    for (const id of ['SOV-3-AI-01-AC', 'SOV-3-AI-02-AC']) {
      expect(byId[id]?.cada_fidelity, id).not.toBe('direct');
    }
  });

  it('SOV-2-03 (state of defense) carries no CADA mapping', () => {
    expect(byId['SOV-2-03']?.applies_to_cada).toBeFalsy();
  });

  it('L2(g)(iv) maps to SOV-2-07-CADA and cites no nonexistent L4(g) romanette', () => {
    const q = byId['SOV-2-07-CADA'];
    expect(q?.cada_fidelity).toBe('direct');
    expect(q?.cada_annex_ref).toMatch(/L2\(g\)\(iv\)/);
    expect(q?.cada_annex_ref).not.toMatch(/L4\(g\)\(iv\)/); // L4(g) has no sub-points
  });

  it('every direct CADA tag carries an annex ref; every inferred tag carries a rationale', () => {
    for (const q of allQuestions.filter(q => q.applies_to_cada)) {
      if (q.cada_fidelity === 'direct') expect(q.cada_annex_ref, q.id).toBeTruthy();
      if (q.cada_fidelity === 'inferred') expect((q as any).cada_fidelity_rationale, q.id).toBeTruthy();
    }
  });
});
