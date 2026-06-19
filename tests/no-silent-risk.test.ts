import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile, LayerControl } from '../shared/src/schema';
import { firedRisks } from '../shared/src/report';
import { deriveControlProfile, togglesFromDefaults, type ToggleProfile } from '../shared/src/scoping-derive';

// ── The brief's four deployment scenarios (instructions.txt) + the sovereign baseline ──
//
// No-silent-risk guarantee: when a question vanishes by scope, a live structural risk
// must never vanish with it. The mechanism is the risk register firing as findings —
// but a fired risk is only surfaceable to a CSI user (inline in the questionnaire where
// its question would have been, and on the results page) if it is bridged to at least
// one CSI-applicable question. A fired risk whose question_ids are all LMIC/CADA-only is
// silent for CSI users. This test pins that the bridge holds across the four scenarios.

const criteria = criteriaJson as unknown as CriteriaFile;
const allQuestions = criteria.objectives.flatMap(o => o.questions);
const csiQuestionIds = new Set(
  allQuestions.filter(q => q.applies_to_csi_composite).map(q => q.id)
);

const profileOf = (s: Parameters<typeof togglesFromDefaults>[0]): ControlProfile =>
  deriveControlProfile(togglesFromDefaults(s));

const SOVEREIGN_LC: LayerControl = {
  ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country',
};
const sovereignProfile = (): ControlProfile => ({
  L1: { ...SOVEREIGN_LC }, L2: { ...SOVEREIGN_LC }, L3: { ...SOVEREIGN_LC },
  L4: { ...SOVEREIGN_LC }, L5: { ...SOVEREIGN_LC }, L6: { ...SOVEREIGN_LC },
});

// Scenario 2: govt-owned sovereign DC, but the hypervisor is a commercially licensed
// platform (VMware/Nutanix) and the vendor holds privileged support access from abroad.
function govDcForeignSupport(): ControlProfile {
  const tp: ToggleProfile = togglesFromDefaults('own_datacenter');
  tp.L3 = { owned: 'client', operated: 'client', supported: '3p', support_nature: 'licensed_supported', location: 'in_country' };
  tp.L5 = { owned: 'client', operated: '3p', supported: '3p', location: 'foreign' };
  return deriveControlProfile(tp);
}

const SCENARIOS: Record<string, ControlProfile> = {
  '1. international hyperscaler IaaS/PaaS (foreign region)': profileOf('hyperscaler'),
  '2. govt-owned sovereign DC + foreign-vendor support': govDcForeignSupport(),
  '3. govt cloud in local commercial DC (colocation)': profileOf('colocation'),
  '4. fully managed by local SI': profileOf('managed_service'),
  '5. sovereign baseline (control)': sovereignProfile(),
};

describe('no-silent-risk — every fired structural risk is bridged to a CSI question', () => {
  for (const [name, profile] of Object.entries(SCENARIOS)) {
    test(`${name}: no fired risk is silent in CSI mode`, () => {
      for (const risk of firedRisks(profile)) {
        const hasCsiQuestion = risk.question_ids.some(id => csiQuestionIds.has(id));
        expect(
          hasCsiQuestion,
          `${risk.id} ("${risk.title}") fires but none of its question_ids [${risk.question_ids.join(', ')}] ` +
          `is a CSI-applicable question — it would be silent for a CSI user.`
        ).toBe(true);
      }
    });
  }

  test('sovereign baseline fires only the self-sufficiency verification risk', () => {
    // The most sovereign posture carries no third-party risk — its only residual
    // concern is verification: can you actually self-patch/operate the OSS stack
    // (RISK-L3-SKILLS-01, the SELF_SUFFICIENCY surface). It must be CSI-bridged.
    const fired = firedRisks(sovereignProfile());
    expect(fired.map(r => r.id)).toEqual(['RISK-L3-SKILLS-01']);
    expect(fired[0].question_ids.some(q => csiQuestionIds.has(q))).toBe(true);
  });

  // Regression guard: the L4 egress/termination exit-barrier risks fire on a provider-
  // owned managed layer (the hyperscaler case) and were previously bridged only to
  // LMIC-only questions — silent for CSI users. They must now carry a CSI question.
  test('L4 egress/termination risks fire for a hyperscaler and are CSI-bridged', () => {
    const fired = firedRisks(profileOf('hyperscaler'));
    for (const id of ['RISK-L4-EGRESS-01', 'RISK-L4-TERMINATION-01']) {
      const risk = fired.find(r => r.id === id);
      expect(risk, `${id} must fire for a hyperscaler profile`).toBeDefined();
      expect(
        risk!.question_ids.some(q => csiQuestionIds.has(q)),
        `${id} must bridge to a CSI question`
      ).toBe(true);
    }
  });
});
