import { describe, it, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';

// EU-CSF v1.2.1 §5 — single source of truth. Do not edit without a DR entry.
const EU_CSF_S5_WEIGHTS: Record<string, number> = {
  'SOV-1': 0.15, 'SOV-2': 0.10, 'SOV-3': 0.10, 'SOV-4': 0.15,
  'SOV-5': 0.20, 'SOV-6': 0.15, 'SOV-7': 0.10, 'SOV-8': 0.05,
};

describe('EU-CSF §5 weight fidelity', () => {
  it('top-level weights map matches §5 exactly', () => {
    expect(criteriaJson.weights).toEqual(EU_CSF_S5_WEIGHTS);
  });

  it('per-objective weight fields agree with §5 and with the top-level map', () => {
    for (const obj of criteriaJson.objectives) {
      if ((obj as { layer?: string }).layer === 'lmic_only') continue; // LMIC-only objectives not in EU-CSF §5
      expect(obj.weight, `weight drift on ${obj.id}`).toBeCloseTo(EU_CSF_S5_WEIGHTS[obj.id], 9);
      expect(obj.weight, `dual-source disagreement on ${obj.id}`).toBeCloseTo(
        (criteriaJson.weights as Record<string, number>)[obj.id], 9
      );
    }
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(EU_CSF_S5_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 9);
  });
});
