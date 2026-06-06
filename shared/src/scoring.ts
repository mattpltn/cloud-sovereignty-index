import type { CriteriaFile, Question } from './schema.js';
import type {
  AssessmentResult, EuCsfResult, EuCsfObjectiveResult,
  C3aResult, C3aObjectiveTierResult, C3aAttainmentBand, C3aQuestionResult,
  CsiCompositeResult, CsiObjectiveResult, CsiMaturityTier,
  CadaResult, CadaLevelResult, CadaGapItem,
  QuestionResult, GapItem, AnswerMap, FrameworkMode,
} from './types.js';

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
  const globalSeal = values.length > 0 ? Math.min(...values.map(o => o.seal)) : 0;

  let overallNumerator = 0;
  let weightSum = 0;
  for (const o of values) {
    if (o.max_score > 0) {
      overallNumerator += (o.raw_score / o.max_score) * o.weight;
      weightSum += o.weight;
    }
  }
  const globalPct = weightSum > 0 ? Math.min(100, (overallNumerator / weightSum) * 100) : 0;

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

  let overallNumerator = 0;
  let weightSum = 0;
  for (const o of values) {
    if (o.max_score > 0) {
      overallNumerator += (o.raw_score / o.max_score) * o.weight;
      weightSum += o.weight;
    }
  }
  const globalPct = weightSum > 0 ? Math.min(100, (overallNumerator / weightSum) * 100) : 0;
  const globalPctFraction = globalPct / 100;

  let globalCsl: number;
  let pct_to_next_tier: number | null;
  if (isGeneralized) {
    globalCsl = pctToMaturityLevel(globalPctFraction);
    const nextThreshold = CSI_TIER_THRESHOLDS[globalCsl + 1] ?? null;
    pct_to_next_tier = nextThreshold !== null ? Math.max(0, Math.round((nextThreshold - globalPctFraction) * 100)) : null;
  } else {
    globalCsl = values.length > 0 ? Math.min(...values.map(o => o.csl)) : 0;
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
