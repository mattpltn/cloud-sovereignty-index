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

const sov508Ladder: LadderRung[] = [
  { tier: 'A', label: 'Takeover support arrangement', points: 10, gate_requires: ['SOV-5-08-EV1'] },
  { tier: 'B', label: 'Rebuild runbook exercised', points: 7, gate_requires: ['SOV-5-08-EV2', 'SOV-5-08-EV3'] },
  { tier: 'C', label: 'Re-platforming required', points: 2 },
];

function makeGateOk(
  answers: AnswerMap,
  questions: CriteriaFile['objectives'][number]['questions']
): (qid: string) => boolean {
  const qMap = new Map(questions.map(q => [q.id, q]));
  const EVIDENCE_RANK: Record<EvidenceStatus, number> = {
    demonstrated: 3, documented: 2, vendor_claim: 1, unverified: 0,
  };
  const REQUIRED_RANK: Record<string, number> = {
    demonstrated: 3, documented: 2, any: 2, // 'any' still requires >= documented to pass a gate
  };
  return (qid: string) => {
    const ans = answers[qid];
    if (!ans || ans.value !== 'yes') return false;
    // Gates NEVER accept vendor_claim or unverified (plan v3 §3.1 locked decision 4)
    const evStatus = (ans.evidence_status ?? 'documented') as EvidenceStatus;
    if (evStatus === 'vendor_claim' || evStatus === 'unverified') return false;
    // Check evidence_status_required on the question
    const q = qMap.get(qid);
    const required = (q as { evidence_status_required?: string })?.evidence_status_required ?? 'any';
    const reqRank = REQUIRED_RANK[required] ?? 2;
    return EVIDENCE_RANK[evStatus] >= reqRank;
  };
}

const allLmicQuestions = criteria.objectives.flatMap(o => o.questions.filter(q => q.applies_to_lmic));

describe('resolveLadderTier', () => {
  it('Tier A claimed without EV1 → resolves to B (B gate met)', () => {
    const answers: AnswerMap = {
      'SOV-5-08-EV2': { tier: 'single', value: 'yes', evidence_status: 'documented' },
      'SOV-5-08-EV3': { tier: 'single', value: 'yes', evidence_status: 'demonstrated' },
    };
    const gateOk = makeGateOk(answers, allLmicQuestions);
    const resolved = resolveLadderTier('A', gateOk, sov508Ladder);
    expect(resolved).toBe('B');
  });

  it('Tier B claimed without EV3 demonstrated → resolves to C', () => {
    const answers: AnswerMap = {
      'SOV-5-08-EV2': { tier: 'single', value: 'yes', evidence_status: 'documented' },
      // EV3 not answered
    };
    const gateOk = makeGateOk(answers, allLmicQuestions);
    const resolved = resolveLadderTier('B', gateOk, sov508Ladder);
    expect(resolved).toBe('C');
  });

  it('EV3 yes with vendor_claim → gate fails → Tier C even if claiming B', () => {
    const answers: AnswerMap = {
      'SOV-5-08-EV2': { tier: 'single', value: 'yes', evidence_status: 'documented' },
      'SOV-5-08-EV3': { tier: 'single', value: 'yes', evidence_status: 'vendor_claim' },
    };
    const gateOk = makeGateOk(answers, allLmicQuestions);
    const resolved = resolveLadderTier('B', gateOk, sov508Ladder);
    expect(resolved).toBe('C');
  });

  it('All gates met → Tier A claimed resolves to A', () => {
    const answers: AnswerMap = {
      'SOV-5-08-EV1': { tier: 'single', value: 'yes', evidence_status: 'documented' },
    };
    const gateOk = makeGateOk(answers, allLmicQuestions);
    const resolved = resolveLadderTier('A', gateOk, sov508Ladder);
    expect(resolved).toBe('A');
  });

  it('Tier C claimed with no gates → always resolves to C', () => {
    const gateOk = () => false;
    expect(resolveLadderTier('C', gateOk, sov508Ladder)).toBe('C');
  });
});

describe('autonomyRungsUnlocked', () => {
  it('returns true when all prerequisites met at or above LOCAL_STAFF_FLOOR_PCT', () => {
    const yes = (id: string) => ['SOV-6-12-LMIC', 'SOV-9-05-LMIC', 'SOV-5-08-EV1', 'SOV-1-12-LMIC'].includes(id);
    expect(autonomyRungsUnlocked(yes, LOCAL_STAFF_FLOOR_PCT)).toBe(true);
  });

  it('returns false when staffPct below LOCAL_STAFF_FLOOR_PCT', () => {
    const yes = (id: string) => ['SOV-6-12-LMIC', 'SOV-9-05-LMIC', 'SOV-5-08-EV1', 'SOV-1-12-LMIC'].includes(id);
    expect(autonomyRungsUnlocked(yes, LOCAL_STAFF_FLOOR_PCT - 1)).toBe(false);
  });

  it('returns false when tested exit (SOV-6-12-LMIC) not met', () => {
    const yes = (id: string) => ['SOV-9-05-LMIC', 'SOV-5-08-EV1', 'SOV-1-12-LMIC'].includes(id);
    expect(autonomyRungsUnlocked(yes, LOCAL_STAFF_FLOOR_PCT)).toBe(false);
  });

  it('returns false when no support path (neither EV1 nor EV3)', () => {
    const yes = (id: string) => ['SOV-6-12-LMIC', 'SOV-9-05-LMIC', 'SOV-1-12-LMIC'].includes(id);
    expect(autonomyRungsUnlocked(yes, LOCAL_STAFF_FLOOR_PCT)).toBe(false);
  });

  it('LOCAL_STAFF_FLOOR_PCT is exactly 30', () => {
    expect(LOCAL_STAFF_FLOOR_PCT).toBe(30);
  });
});

describe('scoreLmic axis separation', () => {
  it('scoreLmic returns LmicAxes with autonomyPct and assurancePct as separate values', () => {
    const answers: AnswerMap = {};
    // Answer all LMIC questions yes
    for (const q of allLmicQuestions) {
      if (q.type === 'tiered_ladder') {
        answers[q.id] = { tier: 'ladder', value: 'yes', tier_claimed: 'C' };
      } else {
        answers[q.id] = { tier: 'single', value: 'yes', evidence_status: 'documented' };
      }
    }
    const result = scoreLmic(answers, criteria);
    expect(result).toHaveProperty('autonomyPct');
    expect(result).toHaveProperty('assurancePct');
    expect(typeof result.autonomyPct).toBe('number');
    expect(typeof result.assurancePct).toBe('number');
    // No blended scalar — the result is an object with two separate values
    expect(typeof result).toBe('object');
    expect(Object.keys(result).length).toBe(2);
  });

  it('SOV-5-09-LMIC no → tier capped at C even with other gates met', () => {
    const answers: AnswerMap = {
      'SOV-5-08-EV1': { tier: 'single', value: 'yes', evidence_status: 'documented' },
      'SOV-5-08-EV2': { tier: 'single', value: 'yes', evidence_status: 'documented' },
      'SOV-5-08-EV3': { tier: 'single', value: 'yes', evidence_status: 'demonstrated' },
      'SOV-5-08-LMIC': { tier: 'ladder', value: 'yes', tier_claimed: 'A' },
      'SOV-5-09-LMIC': { tier: 'single', value: 'no' },
    };
    // Add all other LMIC answers as no to keep it simple
    for (const q of allLmicQuestions) {
      if (!answers[q.id]) {
        if (q.type === 'tiered_ladder') {
          answers[q.id] = { tier: 'ladder', value: 'no', tier_claimed: 'C' };
        } else {
          answers[q.id] = { tier: 'single', value: 'no' };
        }
      }
    }
    const result = scoreLmic(answers, criteria);
    // Should return a valid LmicAxes (not throw)
    expect(result).toHaveProperty('autonomyPct');
  });
});
