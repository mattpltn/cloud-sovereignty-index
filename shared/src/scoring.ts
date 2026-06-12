import type { CriteriaFile, Question, LadderRung } from './schema.js';
import type {
  AssessmentResult, EuCsfResult, EuCsfObjectiveResult,
  C3aResult, C3aObjectiveTierResult, C3aAttainmentBand, C3aQuestionResult,
  CsiCompositeResult, CsiObjectiveResult, CsiMaturityTier,
  CadaResult, CadaLevelResult, CadaGapItem,
  QuestionResult, GapItem, AnswerMap, FrameworkMode,
  LmicAxes, LmicResult, EvidenceStatus,
} from './types.js';

// ── Global Sovereignty Score (EU-CSF v1.2.1 §5) ──────────────────────────────
// SovereigntyScore = Σ_n [Score(SOV_n)/Max.Score(SOV_n)] × Weight(SOV_n)
// Objectives with max_score = 0 are excluded; weight basis renormalized (DR-F1).
export function computeSovereigntyScorePct(
  objectives: Array<{ raw_score: number; max_score: number; weight: number }>
): number {
  let weightedNormalized = 0;
  let weightBasis = 0;
  for (const o of objectives) {
    if (o.max_score > 0) {
      weightedNormalized += (o.raw_score / o.max_score) * o.weight;
      weightBasis += o.weight;
    }
  }
  return weightBasis > 0
    ? Math.min(100, (weightedNormalized / weightBasis) * 100)
    : 0;
}

// ── LMIC scoring ──────────────────────────────────────────────────────────────

// Local operating-staff floor for autonomy rungs, adopted from the World Bank
// local labor participation requirement (30% of labor cost; PR 2025-07-18;
// Procurement Regulations 7th ed. §5.54). Configurable per project because
// §5.54 applies "unless otherwise agreed with the Bank" (DR-L9).
export const LOCAL_STAFF_FLOOR_PCT = 30;

const EVIDENCE_RANK: Record<EvidenceStatus, number> = {
  demonstrated: 3, documented: 2, vendor_claim: 1, unverified: 0,
};

// Resolves a claimed ladder tier downward until its gate predicates are satisfied.
// Gates NEVER accept vendor_claim or unverified (plan v3 locked decision 4).
export function resolveLadderTier(
  claimed: 'A' | 'B' | 'C',
  gateOk: (qid: string) => boolean,
  ladder: LadderRung[]
): 'A' | 'B' | 'C' {
  const order: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  for (const t of order.slice(order.indexOf(claimed))) {
    const rung = ladder.find(r => r.tier === t)!;
    if (!rung.gate_requires || rung.gate_requires.every(gateOk)) return t;
  }
  return 'C';
}

// Returns true when upper stack-autonomy rungs are eligible to contribute scores.
// Requires all operational capability prerequisites to be demonstrated (DR-L3).
export function autonomyRungsUnlocked(
  yes: (id: string) => boolean,
  staffPct: number
): boolean {
  return (
    yes('SOV-6-12-LMIC') &&
    yes('SOV-9-05-LMIC') &&
    (yes('SOV-5-08-EV1') || yes('SOV-5-08-EV3')) &&
    staffPct >= LOCAL_STAFF_FLOOR_PCT
  );
}

// Two-axis LMIC scorer. Each axis is computed via computeSovereigntyScorePct
// over questions tagged to that axis (or 'both'). These axes MUST NOT be
// combined into a single scalar (plan v3 locked decision 2).
export function scoreLmic(answers: AnswerMap, criteria: CriteriaFile): LmicAxes {
  const lmicQuestions = criteria.objectives.flatMap(o =>
    o.questions.filter(q => q.applies_to_lmic)
  );

  // Build gate predicate for ladder resolution
  const qRequiredRank: Map<string, number> = new Map();
  for (const q of lmicQuestions) {
    const req = (q as { evidence_status_required?: string }).evidence_status_required ?? 'any';
    const rank = req === 'demonstrated' ? 3 : req === 'documented' ? 2 : 2; // 'any' still needs >= documented for gates
    qRequiredRank.set(q.id, rank);
  }

  const yesQ = (qid: string) => answers[qid]?.value === 'yes';

  const gateOk = (qid: string): boolean => {
    const ans = answers[qid];
    if (!ans || ans.value !== 'yes') return false;
    const evStatus = (ans.evidence_status ?? 'unverified') as EvidenceStatus;
    if (evStatus === 'vendor_claim' || evStatus === 'unverified') return false;
    const reqRank = qRequiredRank.get(qid) ?? 2;
    return EVIDENCE_RANK[evStatus] >= reqRank;
  };

  // Derive staffPct from SOV-1-12-LMIC band selection (DR-L9)
  const STAFF_BAND_LOWER: Record<string, number> = { lt30: 0, b30_50: 30, b50_75: 50, gt75: 75 };
  const staffBand = (answers['SOV-1-12-LMIC']?.tier_claimed as string) ?? 'lt30';
  const staffPct = STAFF_BAND_LOWER[staffBand] ?? 0;
  const runksUnlocked = autonomyRungsUnlocked(yesQ, staffPct);

  // Rung-3/4 autonomy question IDs (excluded from scoring when locked)
  const AUTONOMY_RUNG_IDS = new Set(['SOV-6-03', 'SOV-6-01', 'SOV-5-07-CADA']);

  // Resolve the tiered_ladder question tier
  const ladderQ = lmicQuestions.find(q => q.id === 'SOV-5-08-LMIC' && q.type === 'tiered_ladder');
  let resolvedTier: 'A' | 'B' | 'C' | undefined;
  if (ladderQ && ladderQ.type === 'tiered_ladder') {
    const claimedTier = (answers['SOV-5-08-LMIC']?.tier_claimed ?? 'C') as 'A' | 'B' | 'C';
    resolvedTier = resolveLadderTier(claimedTier, gateOk, ladderQ.ladder);
    // SOV-5-09-LMIC clause (c) fail → cap at C (DR-L5)
    if (answers['SOV-5-09-LMIC']?.value === 'no') {
      resolvedTier = 'C';
    }
  }

  // Group questions by pillar for axis computation
  const byPillar = new Map<string, Array<{ q: typeof lmicQuestions[number]; points_earned: number; points_possible: number; axis: string }>>();

  for (const q of lmicQuestions) {
    const axis = q.lmic_axis ?? 'none';
    if (axis === 'none') continue;

    // Autonomy rung exclusion when locked
    if (AUTONOMY_RUNG_IDS.has(q.id) && !runksUnlocked) continue;

    const pillar = q.lmic_pillar ?? 'P0';
    if (!byPillar.has(pillar)) byPillar.set(pillar, []);

    let earned = 0;
    let possible = 0;

    if (q.type === 'tiered_ladder' && q.id === 'SOV-5-08-LMIC' && resolvedTier) {
      const rung = q.ladder.find(r => r.tier === resolvedTier);
      const maxRung = q.ladder.reduce((mx, r) => Math.max(mx, r.points), 0);
      possible = maxRung;
      earned = rung?.points ?? 0;
    } else if (q.type === 'tiered_ladder') {
      const maxPts = q.ladder.reduce((mx, r) => Math.max(mx, r.points), 0);
      possible = maxPts;
      const claimedBand = answers[q.id]?.tier_claimed as string | undefined;
      const rung = claimedBand ? q.ladder.find(r => r.tier === claimedBand) : undefined;
      earned = rung?.points ?? 0;
    } else {
      const stored = answers[q.id];
      const value = stored?.value;
      const pts = (q as { points?: number }).points ?? 5;
      possible = pts;
      if (value === 'yes') earned = pts;
      else if (value === 'partial') earned = pts * 0.5;
    }

    byPillar.get(pillar)!.push({ q, points_earned: earned, points_possible: possible, axis });
  }

  // Build per-axis pillar arrays for computeSovereigntyScorePct
  const autonomyPillars: Array<{ raw_score: number; max_score: number; weight: number }> = [];
  const assurancePillars: Array<{ raw_score: number; max_score: number; weight: number }> = [];

  for (const [, items] of byPillar) {
    let rawA = 0, maxA = 0, rawS = 0, maxS = 0;
    for (const { points_earned, points_possible, axis } of items) {
      if (axis === 'autonomy' || axis === 'both') { rawA += points_earned; maxA += points_possible; }
      if (axis === 'assurance' || axis === 'both') { rawS += points_earned; maxS += points_possible; }
    }
    if (maxA > 0) autonomyPillars.push({ raw_score: rawA, max_score: maxA, weight: 1 });
    if (maxS > 0) assurancePillars.push({ raw_score: rawS, max_score: maxS, weight: 1 });
  }

  return {
    autonomyPct: computeSovereigntyScorePct(autonomyPillars),
    assurancePct: computeSovereigntyScorePct(assurancePillars),
  };
}

// ── SEAL/CSL weakest-link gate ────────────────────────────────────────────────

function computeSealLevel(results: QuestionResult[]): number {
  for (let level = 4; level >= 1; level--) {
    const relevant = results.filter(
      r => r.seal_contribution <= level && r.seal_contribution > 0 && r.value !== 'n/a'
    );
    if (relevant.length === 0) continue;
    if (relevant.every(r => r.value === 'yes')) return level;
  }
  return 0;
}

// ── Tiered question scorer (EU-CSF / CSI Composite modes) ────────────────────

function scoreTieredQuestion(
  q: Extract<Question, { type: 'tiered' }>,
  answers: AnswerMap
): QuestionResult[] {
  const results: QuestionResult[] = [];
  const natAnswer = answers[`${q.id}:national`];
  const blocAnswer = answers[`${q.id}:bloc`] ?? answers[q.id];
  const hasNational = !!q.tiers.national;

  if (hasNational && natAnswer) {
    const { points, seal_contribution } = q.tiers.national!;
    const value = natAnswer.value;
    if (value === 'yes') {
      results.push({
        question_id: q.id, tier: 'national', value,
        points_earned: points, points_possible: points,
        seal_contribution, counts_toward_seal: true, flagged_unsupported: false,
      });
      // National yes auto-satisfies bloc at bloc's seal level (no extra points)
      results.push({
        question_id: q.id, tier: 'bloc', value: 'yes',
        points_earned: 0, points_possible: 0,
        seal_contribution: q.tiers.bloc.seal_contribution,
        counts_toward_seal: true, flagged_unsupported: false,
      });
      return results;
    }
    // National not-yes: bloc tier is the fallback path.
    // When national is 'no', exclude national points from the denominator entirely
    // so that a passing bloc answer earns full bloc credit (not 50% of national+bloc).
    // When national is 'partial', count earned partial toward both numerator and denominator.
    const earned = value === 'n/a' ? 0 : value === 'partial' ? points * 0.5 : 0;
    const possible = value === 'n/a' ? 0 : value === 'partial' ? earned : 0;
    results.push({
      question_id: q.id, tier: 'national', value,
      points_earned: earned,
      points_possible: possible,
      seal_contribution, counts_toward_seal: false, flagged_unsupported: false,
    });
  }

  if (blocAnswer) {
    const { points, seal_contribution } = q.tiers.bloc;
    const value = blocAnswer.value;
    if (value === 'n/a') {
      results.push({
        question_id: q.id, tier: 'bloc', value,
        points_earned: 0, points_possible: 0,
        seal_contribution, counts_toward_seal: false, flagged_unsupported: false,
      });
    } else {
      const earned = value === 'yes' ? points : value === 'partial' ? points * 0.5 : 0;
      results.push({
        question_id: q.id, tier: 'bloc', value,
        points_earned: earned, points_possible: points,
        seal_contribution, counts_toward_seal: value === 'yes', flagged_unsupported: false,
      });
    }
  }
  return results;
}

// ── Gap report builder (EU-CSF / CSI Composite modes) ────────────────────────

function buildGapReport(
  objectiveResults: Array<{ objective_id: string; seal_level: number; weight: number; questions: QuestionResult[] }>
): GapItem[] {
  const gaps: GapItem[] = [];
  for (const obj of objectiveResults) {
    for (const qr of obj.questions) {
      if (qr.value !== 'n/a' && qr.points_possible > 0 && qr.points_earned < qr.points_possible) {
        const g = obj.weight * (1 - qr.points_earned / qr.points_possible) * Math.max(1, 4 - obj.seal_level);
        gaps.push({ objective_id: obj.objective_id, question_id: qr.question_id, tier: qr.tier, gap_score: g, priority: 0, seal_contribution: qr.seal_contribution });
      }
    }
  }
  gaps.sort((a, b) => b.gap_score - a.gap_score);
  const seen = new Set<string>();
  const deduped: GapItem[] = [];
  for (const g of gaps) {
    if (!seen.has(g.question_id)) { seen.add(g.question_id); deduped.push(g); }
  }
  deduped.forEach((g, i) => { g.priority = i + 1; });
  return deduped;
}

// ── EU-CSF mode ───────────────────────────────────────────────────────────────

function scoreEuCsf(answers: AnswerMap, criteria: CriteriaFile): EuCsfResult {
  const perObjective: Record<string, EuCsfObjectiveResult> = {};

  for (const obj of criteria.objectives) {
    const questionResults: QuestionResult[] = [];
    let raw = 0;
    let max = 0;

    for (const q of obj.questions) {
      if (!q.applies_to_eu_csf) continue;

      let results: QuestionResult[];
      if (q.type === 'tiered') {
        results = scoreTieredQuestion(q, answers);
      } else {
        const stored = answers[q.id];
        if (!stored) continue;
        const value = stored.value;
        if (value === 'n/a') {
          results = [{ question_id: q.id, tier: 'single', value, points_earned: 0, points_possible: 0, seal_contribution: q.seal_contribution, counts_toward_seal: false, flagged_unsupported: false }];
        } else {
          const earned = value === 'yes' ? q.points : value === 'partial' ? q.points * 0.5 : 0;
          results = [{ question_id: q.id, tier: 'single', value, points_earned: earned, points_possible: q.points, seal_contribution: q.seal_contribution, counts_toward_seal: value === 'yes', flagged_unsupported: false }];
        }
      }
      for (const r of results) { raw += r.points_earned; max += r.points_possible; questionResults.push(r); }
    }

    const seal = computeSealLevel(questionResults);
    const pct = max > 0 ? Math.min(100, (raw / max) * 100) : 0;
    perObjective[obj.id] = { objective_id: obj.id, title: obj.title, weight: obj.weight, seal, raw_score: raw, max_score: max, pct, questions: questionResults };
  }

  const values = Object.values(perObjective);
  // Only include objectives with EU-CSF questions (max_score > 0) in the SEAL gate
  const sealContributors = values.filter(o => o.max_score > 0);
  const globalSeal = sealContributors.length > 0 ? Math.min(...sealContributors.map(o => o.seal)) : 0;

  const globalPct = computeSovereigntyScorePct(values);

  return {
    per_objective: perObjective,
    global: { seal: globalSeal, pct: globalPct },
    gap_report: buildGapReport(values.map(o => ({ objective_id: o.objective_id, seal_level: o.seal, weight: o.weight, questions: o.questions }))),
  };
}

// ── C3A mode ──────────────────────────────────────────────────────────────────

function pctToC3aAttainment(pct: number): C3aAttainmentBand {
  if (pct >= 90) return 'fully_attained';
  if (pct >= 75) return 'substantially_attained';
  if (pct >= 50) return 'partially_attained';
  return 'not_attained';
}

// Layer A: sovereignty-critical controls — failure caps global attainment at not_attained.
// Encoded as a scoring policy (not criteria metadata) per DR-E26.
const C3A_LAYER_A_IDS = new Set([
  'SOV-2-01', 'SOV-2-02', 'SOV-2-03', 'SOV-3-01', 'SOV-4-09', 'SOV-4-10',
]);

function scoreC3a(answers: AnswerMap, criteria: CriteriaFile, customerSelectedAcIds: string[]): C3aResult {
  const acIdSet = new Set(customerSelectedAcIds);

  const criterionByObj: Record<string, C3aObjectiveTierResult> = {};
  const acByObj: Record<string, C3aObjectiveTierResult | null> = {};
  const failedCriteria: C3aResult['failed_criteria'] = [];

  let globalCPassed = 0;
  let globalCApplicable = 0;
  let globalAcPassed = 0;
  let globalAcApplicable = 0;
  let anyAcSelected = false;

  for (const obj of criteria.objectives) {
    let cPassed = 0;
    let cApplicable = 0;
    let acPassed = 0;
    let acApplicable = 0;
    let objHasAc = false;
    const cQuestions: C3aQuestionResult[] = [];
    const acQuestions: C3aQuestionResult[] = [];

    for (const q of obj.questions) {
      if (!q.applies_to_c3a) continue;

      const isAc = q.c3a_tier === 'additional';

      if (isAc && !acIdSet.has(q.id)) continue; // AC not selected by customer

      // For tiered questions, score each tier as an independent criterion
      if (q.type === 'tiered') {
        const tiers: Array<{ key: string; tierLabel: 'bloc' | 'national' }> = [{ key: `${q.id}:bloc`, tierLabel: 'bloc' }];
        if (q.tiers.national) tiers.push({ key: `${q.id}:national`, tierLabel: 'national' });

        for (const t of tiers) {
          const stored = answers[t.key] ?? answers[q.id];
          if (!stored) continue;
          const value = stored.value;
          const passed = value === 'yes';
          const qr: C3aQuestionResult = {
            question_id: q.id,
            tier: t.tierLabel,
            value,
            passed: passed && value !== 'n/a',
            is_layer_a: C3A_LAYER_A_IDS.has(q.id),
            is_additional_criterion: isAc,
          };
          if (value === 'n/a') {
            (isAc ? acQuestions : cQuestions).push(qr);
            continue; // N/A excluded from C3A count
          }
          if (isAc) {
            acApplicable++;
            objHasAc = true;
            anyAcSelected = true;
            if (passed) acPassed++;
            else failedCriteria.push({ question_id: q.id, title: q.title, objective_id: obj.id, tier: 'additional_criterion' });
            acQuestions.push(qr);
          } else {
            cApplicable++;
            if (passed) cPassed++;
            else failedCriteria.push({ question_id: q.id, title: q.title, objective_id: obj.id, tier: 'criterion' });
            cQuestions.push(qr);
          }
        }
      } else {
        // Single question
        const stored = answers[q.id];
        if (!stored) continue;
        const value = stored.value;
        const passed = value === 'yes';
        const qr: C3aQuestionResult = {
          question_id: q.id,
          tier: 'single',
          value,
          passed: passed && value !== 'n/a',
          is_layer_a: C3A_LAYER_A_IDS.has(q.id),
          is_additional_criterion: isAc,
        };
        if (value === 'n/a') {
          (isAc ? acQuestions : cQuestions).push(qr);
          continue;
        }
        if (isAc) {
          acApplicable++;
          objHasAc = true;
          anyAcSelected = true;
          if (passed) acPassed++;
          else failedCriteria.push({ question_id: q.id, title: q.title, objective_id: obj.id, tier: 'additional_criterion' });
          acQuestions.push(qr);
        } else {
          cApplicable++;
          if (passed) cPassed++;
          else failedCriteria.push({ question_id: q.id, title: q.title, objective_id: obj.id, tier: 'criterion' });
          cQuestions.push(qr);
        }
      }
    }

    const cPct = cApplicable > 0 ? Math.round((cPassed / cApplicable) * 100) : 0;
    criterionByObj[obj.id] = {
      passed: cPassed,
      applicable: cApplicable,
      pct: cPct,
      attainment: pctToC3aAttainment(cPct),
      questions: cQuestions,
    };
    const acPct = acApplicable > 0 ? Math.round((acPassed / acApplicable) * 100) : 0;
    acByObj[obj.id] = objHasAc
      ? { passed: acPassed, applicable: acApplicable, pct: acPct, attainment: pctToC3aAttainment(acPct), questions: acQuestions }
      : null;

    globalCPassed += cPassed;
    globalCApplicable += cApplicable;
    globalAcPassed += acPassed;
    globalAcApplicable += acApplicable;
  }

  const globalCPct = globalCApplicable > 0 ? Math.round((globalCPassed / globalCApplicable) * 100) : 0;

  // Layer A gate: any answered (non-n/a) Layer A criterion that is not 'yes' blocks global attainment
  const layerABlocked = C3A_LAYER_A_IDS.size > 0 && failedCriteria.some(f =>
    f.tier === 'criterion' && C3A_LAYER_A_IDS.has(f.question_id)
  );
  const globalAttainment: C3aAttainmentBand = layerABlocked
    ? 'not_attained'
    : pctToC3aAttainment(globalCPct);

  const globalAcPct = globalAcApplicable > 0 ? Math.round((globalAcPassed / globalAcApplicable) * 100) : 0;

  return {
    criterion: {
      per_objective: criterionByObj,
      global: {
        passed: globalCPassed,
        applicable: globalCApplicable,
        pct: globalCPct,
        attainment: globalAttainment,
      },
    },
    additional_criterion: {
      per_objective: acByObj,
      global: anyAcSelected
        ? { passed: globalAcPassed, applicable: globalAcApplicable, pct: globalAcPct, attainment: pctToC3aAttainment(globalAcPct) }
        : null,
    },
    failed_criteria: failedCriteria,
    layer_a_blocked: layerABlocked,
  };
}

// ── CSI Composite mode ────────────────────────────────────────────────────────

// Maturity tier thresholds for non-EU Generalized variant (0–1 scale)
const CSI_TIER_THRESHOLDS = [0, 0.41, 0.71, 0.91] as const;

const CSI_MATURITY_TIERS: CsiMaturityTier[] = [
  'dependent', 'managed_dependency', 'strategic_autonomy', 'sovereign',
];

function pctToMaturityLevel(pct: number): number {
  if (pct >= CSI_TIER_THRESHOLDS[3]) return 3; // Sovereign
  if (pct >= CSI_TIER_THRESHOLDS[2]) return 2; // Strategic Autonomy
  if (pct >= CSI_TIER_THRESHOLDS[1]) return 1; // Managed Dependency
  return 0;                                     // Dependent
}

function scoreCsiComposite(answers: AnswerMap, criteria: CriteriaFile, variant: string): CsiCompositeResult {
  const isGeneralized = variant === 'Generalized';
  const perObjective: Record<string, CsiObjectiveResult> = {};

  for (const obj of criteria.objectives) {
    const questionResults: QuestionResult[] = [];
    let raw = 0;
    let max = 0;

    for (const q of obj.questions) {
      if (!q.applies_to_csi_composite) continue;

      let results: QuestionResult[];
      if (q.type === 'tiered') {
        results = scoreTieredQuestion(q, answers);
        // For Generalized: treat 'planned' like 'no' in tiered questions (no partial points path)
        if (isGeneralized) {
          results = results.map(r => r.value === 'planned'
            ? { ...r, points_earned: r.points_possible * 0.25, counts_toward_seal: false }
            : r
          );
        }
      } else {
        const stored = answers[q.id];
        if (!stored) continue;
        const value = stored.value;
        if (value === 'n/a') {
          results = [{ question_id: q.id, tier: 'single', value, points_earned: 0, points_possible: 0, seal_contribution: q.seal_contribution, counts_toward_seal: false, flagged_unsupported: false }];
        } else {
          const earned = value === 'yes' ? q.points
            : value === 'partial' ? q.points * 0.5
            : value === 'planned' && isGeneralized ? q.points * 0.25
            : 0;
          results = [{ question_id: q.id, tier: 'single', value, points_earned: earned, points_possible: q.points, seal_contribution: q.seal_contribution, counts_toward_seal: value === 'yes', flagged_unsupported: false }];
        }
      }
      for (const r of results) { raw += r.points_earned; max += r.points_possible; questionResults.push(r); }
    }

    const csl = computeSealLevel(questionResults);
    const pct = max > 0 ? Math.min(100, (raw / max) * 100) : 0;
    perObjective[obj.id] = { objective_id: obj.id, title: obj.title, weight: obj.weight, csl, raw_score: raw, max_score: max, pct, questions: questionResults };
  }

  const values = Object.values(perObjective);

  const globalPct = computeSovereigntyScorePct(values);
  const globalPctFraction = globalPct / 100;

  let globalCsl: number;
  let pct_to_next_tier: number | null;
  if (isGeneralized) {
    globalCsl = pctToMaturityLevel(globalPctFraction);
    const nextThreshold = CSI_TIER_THRESHOLDS[globalCsl + 1] ?? null;
    pct_to_next_tier = nextThreshold !== null ? Math.max(0, Math.round((nextThreshold - globalPctFraction) * 100)) : null;
  } else {
    // Only include objectives with CSI questions (max_score > 0) in the CSL gate
    const cslContributors = values.filter(o => o.max_score > 0);
    globalCsl = cslContributors.length > 0 ? Math.min(...cslContributors.map(o => o.csl)) : 0;
    pct_to_next_tier = null;
  }

  const maturity_tier: CsiMaturityTier | undefined = isGeneralized
    ? CSI_MATURITY_TIERS[globalCsl]
    : undefined;

  return {
    per_objective: perObjective,
    global: { csl: globalCsl, pct: globalPct, pct_to_next_tier, maturity_tier },
    gap_report: buildGapReport(values.map(o => ({ objective_id: o.objective_id, seal_level: o.csl, weight: o.weight, questions: o.questions }))),
  };
}

// ── CADA third-country-control gradient (Annex II L2(g)/L3(g)/L4(g), Act Art. 18) ──
// EU_CONTROL  = SOV-1-03 yes
// SAFEGUARDS  = SOV-2-05 (g(i)-(iii)) AND SOV-2-07-CADA (g(iv))  [DR-F4: g(i)-(iii) interim]
// DEROGATION  = SOV-1-10-CADA (Art. 18 associated-third-countries list)
// CODE_ACCESS = SOV-6-07-CADA (L3(g)(i) reasonable code access)
export function controlGatePassesAtLevel(level: 2 | 3 | 4, yes: (id: string) => boolean): boolean {
  if (yes('SOV-1-03')) return true;
  const safeguards = yes('SOV-2-05') && yes('SOV-2-07-CADA');
  switch (level) {
    case 2: return safeguards;
    case 3: return yes('SOV-1-10-CADA') && safeguards && yes('SOV-6-07-CADA');
    case 4: return false; // L4(g): no derogation exists
  }
}

// ── CADA mode ─────────────────────────────────────────────────────────────────

const CADA_LEVEL_LABELS = [
  'Not Attained',
  'Union Assurance Level 1 — Self-Assessment',
  'Union Assurance Level 2 — Third-Party Audited',
  'Union Assurance Level 3 — Enhanced',
  'Union Assurance Level 4 — Highest Assurance',
];

function scoreCada(answers: AnswerMap, criteria: CriteriaFile): CadaResult {
  // Collect all CADA-applicable questions with their level requirements
  const cadaQuestions: Array<{
    question_id: string;
    title: string;
    objective_id: string;
    cada_assurance_level: number[];
    min_level: number;
  }> = [];

  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      const qa = q as any;
      if (!qa.applies_to_cada || !qa.cada_assurance_level?.length) continue;
      cadaQuestions.push({
        question_id: q.id,
        title: q.title,
        objective_id: obj.id,
        cada_assurance_level: qa.cada_assurance_level,
        min_level: Math.min(...qa.cada_assurance_level),
      });
    }
  }

  // For each level L, gates[L] = all questions required for that level (cumulative: min_level <= L)
  const levels: CadaLevelResult[] = [];
  let highest = 0;

  for (let L = 1; L <= 4; L++) {
    const gated = cadaQuestions.filter(q => q.min_level <= L);
    const failing = gated.filter(q => {
      const ans = answers[q.question_id];
      return !ans || ans.value !== 'yes';
    });
    const passed = gated.length - failing.length;
    const gate_passed = failing.length === 0;

    levels.push({
      level: L,
      label: CADA_LEVEL_LABELS[L],
      gate_passed,
      criteria_passed: passed,
      criteria_total: gated.length,
      failing_criteria: failing.map(q => ({
        question_id: q.question_id,
        title: q.title,
        objective_id: q.objective_id,
      })),
    });

    if (gate_passed) highest = L;
    else break; // cumulative: stop at first failure
  }

  // Gap report: failing criteria for the next level to achieve
  const nextLevel = highest + 1;
  const gapItems: CadaGapItem[] = [];
  if (nextLevel <= 4) {
    const nextLevelResult = levels.find(l => l.level === nextLevel);
    if (nextLevelResult) {
      nextLevelResult.failing_criteria.forEach((fc, i) => {
        const q = cadaQuestions.find(q => q.question_id === fc.question_id);
        gapItems.push({
          question_id: fc.question_id,
          title: fc.title,
          objective_id: fc.objective_id,
          blocks_level: nextLevel,
          priority: i + 1,
        });
      });
    }
  }

  return {
    highest_level_achieved: highest,
    levels,
    gap_report: gapItems,
    audit_required: highest >= 2,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function scoreAssessment(
  answers: AnswerMap,
  criteria: CriteriaFile,
  assessmentId: string,
  meta: {
    variant: string;
    country_code?: string;
    scope_ids: string[];
    role: string;
    instrument_version: string;
    selected_frameworks?: string[];
    customer_selected_ac_ids?: string[];
  }
): AssessmentResult {
  const frameworks = (meta.selected_frameworks ?? ['csi_composite']) as FrameworkMode[];
  const acIds = meta.customer_selected_ac_ids ?? [];

  const result: AssessmentResult = {
    assessment_id: assessmentId,
    instrument_version: meta.instrument_version,
    selected_frameworks: frameworks,
    variant: meta.variant as any,
    country_code: meta.country_code,
    scope_ids: meta.scope_ids as any,
    role: meta.role as any,
    assessed_at: new Date().toISOString(),
  };

  if (frameworks.includes('eu_csf')) {
    result.eu_csf = scoreEuCsf(answers, criteria);
  }
  if (frameworks.includes('c3a')) {
    result.c3a = scoreC3a(answers, criteria, acIds);
  }
  if (frameworks.includes('csi_composite')) {
    result.csi_composite = scoreCsiComposite(answers, criteria, meta.variant);
  }
  if (frameworks.includes('cada')) {
    result.cada = scoreCada(answers, criteria);
  }

  return result;
}
