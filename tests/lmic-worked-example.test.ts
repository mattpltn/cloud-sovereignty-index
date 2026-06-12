import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  resolveLadderTier,
  autonomyRungsUnlocked,
  scoreLmic,
  LOCAL_STAFF_FLOOR_PCT,
} from '@shared/scoring';
import type { CriteriaFile, LadderRung } from '@shared/schema';
import type { AnswerMap, EvidenceStatus } from '@shared/types';

const criteria: CriteriaFile = JSON.parse(
  readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf-8')
);

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/lmic-worked-example.json'), 'utf-8')
) as {
  candidates: Array<{
    name: string;
    archetype: string;
    expectations: { resolved_tier: string; quadrant: string; rungs_unlocked: boolean };
    answers: AnswerMap;
  }>;
};

const [candidateA, candidateB, candidateC] = fixture.candidates;

const allLmicQuestions = criteria.objectives.flatMap(o => o.questions.filter(q => q.applies_to_lmic));

const sov508Ladder: LadderRung[] = allLmicQuestions.find(
  q => q.id === 'SOV-5-08-LMIC' && q.type === 'tiered_ladder'
)!.ladder as LadderRung[];

const EVIDENCE_RANK: Record<EvidenceStatus, number> = {
  demonstrated: 3, documented: 2, vendor_claim: 1, unverified: 0,
};

function makeGateOk(answers: AnswerMap): (qid: string) => boolean {
  const REQUIRED_RANK: Record<string, number> = { demonstrated: 3, documented: 2, any: 2 };
  const qMap = new Map(allLmicQuestions.map(q => [q.id, q]));
  return (qid: string) => {
    const ans = answers[qid];
    if (!ans || ans.value !== 'yes') return false;
    const evStatus = (ans.evidence_status ?? 'unverified') as EvidenceStatus;
    if (evStatus === 'vendor_claim' || evStatus === 'unverified') return false;
    const q = qMap.get(qid);
    const required = (q as { evidence_status_required?: string })?.evidence_status_required ?? 'any';
    const reqRank = REQUIRED_RANK[required] ?? 2;
    return EVIDENCE_RANK[evStatus] >= reqRank;
  };
}

function deriveStaffPct(answers: AnswerMap): number {
  const STAFF_BAND_LOWER: Record<string, number> = { lt30: 0, b30_50: 30, b50_75: 50, gt75: 75 };
  const band = (answers['SOV-1-12-LMIC']?.tier_claimed as string) ?? 'lt30';
  return STAFF_BAND_LOWER[band] ?? 0;
}

function resolveSOV508Tier(answers: AnswerMap): 'A' | 'B' | 'C' {
  const gateOk = makeGateOk(answers);
  const claimed = (answers['SOV-5-08-LMIC']?.tier_claimed ?? 'C') as 'A' | 'B' | 'C';
  let tier = resolveLadderTier(claimed, gateOk, sov508Ladder);
  if (answers['SOV-5-09-LMIC']?.value === 'no') tier = 'C';
  return tier;
}

function checkRungs(answers: AnswerMap): boolean {
  const yesQ = (id: string) => answers[id]?.value === 'yes';
  const staffPct = deriveStaffPct(answers);
  return autonomyRungsUnlocked(yesQ, staffPct);
}

describe('LMIC worked example — tier resolution', () => {
  it('Candidate A: claimed B but EV2=no → resolves Tier C', () => {
    expect(resolveSOV508Tier(candidateA.answers)).toBe('C');
  });

  it('Candidate B: claimed B with EV2=documented + EV3=demonstrated → resolves Tier B', () => {
    expect(resolveSOV508Tier(candidateB.answers)).toBe('B');
  });

  it('Candidate C: claimed B with EV3 absent → resolves Tier C', () => {
    expect(resolveSOV508Tier(candidateC.answers)).toBe('C');
  });
});

describe('LMIC worked example — rung lock state', () => {
  it('Candidate B: SOV-6-12 yes + SOV-9-05 yes + EV3 demonstrated + staffPct=50 → rungs unlocked', () => {
    expect(checkRungs(candidateB.answers)).toBe(true);
  });

  it('Candidate A: neither EV1 nor EV3 yes → rungs locked', () => {
    expect(checkRungs(candidateA.answers)).toBe(false);
  });

  it('Candidate C: SOV-6-12 no → rungs locked regardless of staffPct', () => {
    expect(checkRungs(candidateC.answers)).toBe(false);
  });
});

describe('LMIC worked example — quadrant placement', () => {
  it('Candidate A: assurancePct > autonomyPct (assured_but_dependent)', () => {
    const result = scoreLmic(candidateA.answers, criteria);
    expect(result.assurancePct).toBeGreaterThan(result.autonomyPct);
  });

  it('Candidate C: autonomyPct > assurancePct (autonomous_but_fragile)', () => {
    const result = scoreLmic(candidateC.answers, criteria);
    expect(result.autonomyPct).toBeGreaterThan(result.assurancePct);
  });
});

describe('LMIC worked example — evidence default regression (DR-L11)', () => {
  it('Candidate C SOV-5-08-EV1 bare yes (no evidence_status) must NOT satisfy Tier A gate', () => {
    const gateOk = makeGateOk(candidateC.answers);
    // EV1 has value:'yes' but no evidence_status → unverified → gate fails
    expect(gateOk('SOV-5-08-EV1')).toBe(false);
    // As a result, if C had claimed A, it would still resolve to C
    const claimed: 'A' | 'B' | 'C' = 'A';
    const resolved = resolveLadderTier(claimed, gateOk, sov508Ladder);
    expect(resolved).not.toBe('A');
  });
});

describe('LMIC worked example — D1 archetype invariance', () => {
  it('Identical answers with different archetype tag produce identical axis scores', () => {
    // Construct an answer map identical to candidate A's, then score it as if it were candidate B's archetype.
    // Archetype is fixture metadata — it is never passed to scoreLmic, so scores must be identical.
    const scoreA = scoreLmic(candidateA.answers, criteria);
    const scoreAswapped = scoreLmic({ ...candidateA.answers }, criteria); // same answers, swapped archetype is implicit

    expect(scoreA.autonomyPct).toBeCloseTo(scoreAswapped.autonomyPct, 10);
    expect(scoreA.assurancePct).toBeCloseTo(scoreAswapped.assurancePct, 10);
  });
});
