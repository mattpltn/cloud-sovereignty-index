import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile, LayerControl } from '../shared/src/schema';
import { firedRisks, unaskedFiredRisks } from '../shared/src/report';
import { radarPoints } from '../src/components/DomainRadar';
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

// unaskedFiredRisks consolidates the structural findings surfaced once on the review page
// (no longer rendered per-objective in the questionnaire, which caused a cross-objective
// duplicate). Pins that it is deduped and only includes risks with no VISIBLE CSI bridge.
describe('unaskedFiredRisks — consolidated, deduped scope findings', () => {
  test('no risk appears more than once for any scenario (dedup by construction)', () => {
    for (const [name, profile] of Object.entries(SCENARIOS)) {
      const ids = unaskedFiredRisks(profile, criteria).map(r => r.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dupes, `${name}: ${dupes.join(', ')} appeared more than once`).toEqual([]);
    }
  });

  test('colocation surfaces the facility-access finding exactly once (duplicate regression)', () => {
    // RISK-L1-ACCESS-01 bridges SOV-3-01 + SOV-2-03 (two objectives). Both are hidden by
    // scope in the colocation profile, so it has no visible bridge → recorded as a finding,
    // once — previously it rendered on both the SOV-2 and SOV-3 pages.
    const ids = unaskedFiredRisks(profileOf('colocation'), criteria).map(r => r.id);
    expect(ids.filter(id => id === 'RISK-L1-ACCESS-01')).toEqual(['RISK-L1-ACCESS-01']);
  });

  test('a risk whose CSI bridge question is visible is NOT listed (asked interactively)', () => {
    // The sovereign baseline asks RISK-L3-SKILLS-01's bridge question interactively
    // (nothing is scoped out), so it must not also appear as an unasked finding.
    const ids = unaskedFiredRisks(sovereignProfile(), criteria).map(r => r.id);
    expect(ids).not.toContain('RISK-L3-SKILLS-01');
  });

  test('closed-platform L3 lock-in fires for a client-owned proprietary virtualization layer', () => {
    // The "ownership without reversibility" gap: RISK-L3-HYPERSCALER-01 needs provider
    // ownership, so a client-owned but proprietary_inaccessible L3 (the appliance) fired
    // no L3 risk. RISK-L3-LOCKIN-01 closes it (owner-independent).
    const appliance: ControlProfile = {
      L1: { ownership: 'client', operation: 'client_staff', dependency: 'na', location: 'in_country' },
      L2: { ownership: 'client', operation: 'client_staff', dependency: 'na', location: 'in_country' },
      L3: { ownership: 'client', operation: 'client_staff', dependency: 'proprietary_inaccessible', location: 'in_country' },
      L4: { ownership: 'client', operation: 'client_staff', dependency: 'proprietary_inaccessible', location: 'in_country' },
      L5: { ownership: 'client', operation: 'client_staff', dependency: 'na', location: 'in_country' },
      L6: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
    };
    const fired = firedRisks(appliance).map(r => r.id);
    expect(fired).toContain('RISK-L3-LOCKIN-01');
    const risk = firedRisks(appliance).find(r => r.id === 'RISK-L3-LOCKIN-01')!;
    expect(risk.question_ids.some(q => csiQuestionIds.has(q))).toBe(true);
  });

  test('every unasked fired risk has a CSI bridge question (still no-silent-risk)', () => {
    for (const [name, profile] of Object.entries(SCENARIOS)) {
      for (const risk of unaskedFiredRisks(profile, criteria)) {
        expect(
          risk.question_ids.some(id => csiQuestionIds.has(id)),
          `${name}: ${risk.id} surfaced as a finding but has no CSI bridge question`
        ).toBe(true);
      }
    }
  });
});

describe('radarPoints geometry', () => {
  test('first axis (value 1) sits at 12 o\'clock, on the radius', () => {
    const [[x, y]] = radarPoints([1, 1, 1, 1], 100, 100, 50);
    expect(x).toBeCloseTo(100, 5); // straight up → same x as centre
    expect(y).toBeCloseTo(50, 5);  // cy - r
  });

  test('value 0 maps to the centre; clamps out-of-range values', () => {
    const pts = radarPoints([0, 2, -1], 100, 100, 50);
    expect(pts[0][0]).toBeCloseTo(100, 5);
    expect(pts[0][1]).toBeCloseTo(100, 5);
    // value 2 clamps to 1 (full radius), value -1 clamps to 0 (centre)
    const full = radarPoints([1, 1, 1], 100, 100, 50);
    expect(pts[1][0]).toBeCloseTo(full[1][0], 5);
    expect(pts[1][1]).toBeCloseTo(full[1][1], 5);
    expect(pts[2][0]).toBeCloseTo(100, 5);
    expect(pts[2][1]).toBeCloseTo(100, 5);
  });

  test('four equal axes are symmetric about the centre', () => {
    const [top, right, bottom, left] = radarPoints([1, 1, 1, 1], 0, 0, 10);
    expect(top).toEqual([expect.closeTo(0, 5), expect.closeTo(-10, 5)]);
    expect(right).toEqual([expect.closeTo(10, 5), expect.closeTo(0, 5)]);
    expect(bottom).toEqual([expect.closeTo(0, 5), expect.closeTo(10, 5)]);
    expect(left).toEqual([expect.closeTo(-10, 5), expect.closeTo(0, 5)]);
  });
});
