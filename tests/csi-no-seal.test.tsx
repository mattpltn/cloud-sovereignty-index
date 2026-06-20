// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ScoreHero from '../src/components/ScoreHero';

// CSI must never say "SEAL" (it speaks in CSL / maturity tiers). EU-CSF & C3A keep SEAL,
// but a CSI-only result must render zero "SEAL" — in either variant.
function csiResult(variant: 'Generalized' | 'EU-CSF') {
  return {
    assessment_id: 'x',
    instrument_version: '2.0',
    selected_frameworks: ['csi_composite'],
    variant,
    csi_composite: {
      global: {
        csl: variant === 'Generalized' ? 0 : 1,
        pct: 74,
        pct_to_next_tier: null,
        maturity_tier: 'dependent',
        weakest_link_csl: 0,
        gating_objective_ids: ['SOV-6'],
      },
      per_objective: {
        'SOV-6': { objective_id: 'SOV-6', title: 'Operational Reversibility', weight: 15, csl: 0, raw_score: 30, max_score: 40, pct: 75, questions: [] },
      },
      gap_report: [],
    },
  } as any;
}

describe('CSI surfaces never mention SEAL', () => {
  for (const variant of ['Generalized', 'EU-CSF'] as const) {
    test(`ScoreHero CSI card (${variant}) contains no "SEAL"`, () => {
      const { container } = render(<ScoreHero result={csiResult(variant)} />);
      expect(container.textContent).not.toMatch(/SEAL/i);
      // and it does speak in CSL / a maturity tier
      expect(container.textContent).toMatch(/CSL|Dependent|readiness/);
    });
  }
});
