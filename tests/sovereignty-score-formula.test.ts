import { describe, it, expect } from 'vitest';
import { computeSovereigntyScorePct } from '@shared/scoring';

describe('Sovereignty Score — EU-CSF v1.2.1 §5 formula pin', () => {
  const objectives = [
    { id: 'SOV-1', weight: 0.15, max_score: 120 },
    { id: 'SOV-2', weight: 0.10, max_score: 70 },
    { id: 'SOV-3', weight: 0.10, max_score: 140 },
    { id: 'SOV-4', weight: 0.15, max_score: 130 },
    { id: 'SOV-5', weight: 0.20, max_score: 60 },
    { id: 'SOV-6', weight: 0.15, max_score: 80 },
    { id: 'SOV-7', weight: 0.10, max_score: 90 },
    { id: 'SOV-8', weight: 0.05, max_score: 50 },
  ];

  it('100% on SOV-5 alone yields exactly its §5 weight (20%), not point-mass share', () => {
    const input = objectives.map(o => ({
      weight: o.weight,
      max_score: o.max_score,
      raw_score: o.id === 'SOV-5' ? o.max_score : 0,
    }));
    expect(computeSovereigntyScorePct(input)).toBeCloseTo(20.0, 6);
    // Regression guard: the Σ(w·raw)/Σ(w·max) formula gives 12.77…% here.
    expect(computeSovereigntyScorePct(input)).not.toBeCloseTo(12.77, 1);
  });

  it('uniform 50% across all objectives yields 50%', () => {
    const input = objectives.map(o => ({
      weight: o.weight, max_score: o.max_score, raw_score: o.max_score / 2,
    }));
    expect(computeSovereigntyScorePct(input)).toBeCloseTo(50.0, 6);
  });

  it('perfect score yields 100%, zero score yields 0%', () => {
    const full = objectives.map(o => ({ weight: o.weight, max_score: o.max_score, raw_score: o.max_score }));
    const none = objectives.map(o => ({ weight: o.weight, max_score: o.max_score, raw_score: 0 }));
    expect(computeSovereigntyScorePct(full)).toBeCloseTo(100.0, 6);
    expect(computeSovereigntyScorePct(none)).toBe(0);
  });

  it('n/a objective (max_score 0) renormalizes weight basis (DR-F1)', () => {
    // Only SOV-1 (w .15) and SOV-2 (w .10) scorable; SOV-1 at 100%, SOV-2 at 0%.
    const input = [
      { weight: 0.15, max_score: 100, raw_score: 100 },
      { weight: 0.10, max_score: 50, raw_score: 0 },
      { weight: 0.75, max_score: 0, raw_score: 0 }, // excluded
    ];
    expect(computeSovereigntyScorePct(input)).toBeCloseTo((0.15 / 0.25) * 100, 6);
  });

  it('hand-computed mixed case', () => {
    // raw/max: SOV-1 .5, SOV-2 1, SOV-3 .25, SOV-4 0, SOV-5 .8, SOV-6 1, SOV-7 .1, SOV-8 0
    // §5: .5(.15)+1(.10)+.25(.10)+0+.8(.20)+1(.15)+.1(.10)+0 = .075+.10+.025+.16+.15+.01 = .52
    const ratios: Record<string, number> = {
      'SOV-1': 0.5, 'SOV-2': 1, 'SOV-3': 0.25, 'SOV-4': 0,
      'SOV-5': 0.8, 'SOV-6': 1, 'SOV-7': 0.1, 'SOV-8': 0,
    };
    const input = objectives.map(o => ({
      weight: o.weight, max_score: o.max_score, raw_score: o.max_score * ratios[o.id],
    }));
    expect(computeSovereigntyScorePct(input)).toBeCloseTo(52.0, 6);
  });
});
