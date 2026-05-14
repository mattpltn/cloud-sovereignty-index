import type { CriteriaFile, Question } from './schema.js';
import type { AssessmentResult, ObjectiveResult, QuestionResult, GapItem, AnswerMap, C5SupplementaryResult, C5DomainResult } from './types.js';

function computeSealLevel(results: QuestionResult[]): number {
  for (let level = 4; level >= 1; level--) {
    const relevant = results.filter(r => r.seal_contribution <= level && r.seal_contribution > 0 && r.value !== 'n/a');
    if (relevant.length === 0) continue;
    if (relevant.every(r => r.value === 'yes')) return level;
  }
  return 0;
}

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
      // National satisfied → bloc is auto-satisfied at its own level
      results.push({
        question_id: q.id, tier: 'national', value,
        points_earned: points, points_possible: points,
        seal_contribution, counts_toward_seal: true, flagged_unsupported: false,
      });
      // Auto-satisfy bloc (no extra points — same criterion at lower bar)
      results.push({
        question_id: q.id, tier: 'bloc', value: 'yes',
        points_earned: 0, points_possible: 0,  // points already counted via national
        seal_contribution: q.tiers.bloc.seal_contribution,
        counts_toward_seal: true, flagged_unsupported: false,
      });
      return results;
    }

    // National not satisfied — record it, then fall through to bloc
    const earned = value === 'n/a' ? 0 : value === 'partial' ? points * 0.5 : 0;
    results.push({
      question_id: q.id, tier: 'national', value,
      points_earned: value === 'n/a' ? 0 : earned,
      points_possible: value === 'n/a' ? 0 : points,
      seal_contribution, counts_toward_seal: false, flagged_unsupported: false,
    });
  }

  // Score bloc tier (either no country selected, or national failed/unanswered)
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

function computeC5Supplementary(answers: AnswerMap, criteria: CriteriaFile): C5SupplementaryResult {
  const details: C5SupplementaryResult['details'] = [];
  const domainMap = new Map<string, C5DomainResult>();

  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (q.type !== 'single') continue;
      if (q.source.doc !== 'C5:2026') continue;
      const stored = answers[q.id];
      const value = stored?.value ?? 'n/a';
      details.push({ question_id: q.id, title: q.title, value, source_clause: q.source.clause });

      if (value === 'n/a') continue;
      const domain = q.source.clause.split(/[\s,-]/)[0]; // "OPS", "BCM", "CRY"
      if (!domainMap.has(domain)) domainMap.set(domain, { domain, met: 0, partial: 0, not_met: 0, applicable: 0 });
      const d = domainMap.get(domain)!;
      d.applicable++;
      if (value === 'yes') d.met++;
      else if (value === 'partial') d.partial++;
      else d.not_met++;
    }
  }

  const by_domain = Array.from(domainMap.values());
  const applicable = by_domain.reduce((s, d) => s + d.applicable, 0);
  return {
    applicable,
    met: by_domain.reduce((s, d) => s + d.met, 0),
    partial: by_domain.reduce((s, d) => s + d.partial, 0),
    not_met: by_domain.reduce((s, d) => s + d.not_met, 0),
    by_domain,
    details,
  };
}

export function scoreAssessment(
  answers: AnswerMap,
  criteria: CriteriaFile,
  assessmentId: string,
  meta: { variant: string; country_code?: string; scope_ids: string[]; role: string; instrument_version: string }
): AssessmentResult {
  const objectives: ObjectiveResult[] = [];

  for (const obj of criteria.objectives) {
    const questionResults: QuestionResult[] = [];
    let raw = 0;
    let max = 0;

    for (const q of obj.questions) {
      // C5:2026 questions are scored separately — they do not contribute to SEAL or sovereignty score
      if (q.type === 'single' && q.source.doc === 'C5:2026') continue;

      let results: QuestionResult[];

      if (q.type === 'tiered') {
        results = scoreTieredQuestion(q, answers);
      } else {
        // single question
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

      for (const r of results) {
        raw += r.points_earned;
        max += r.points_possible;
        questionResults.push(r);
      }
    }

    const seal = computeSealLevel(questionResults);
    const gap = max > 0 ? obj.weight * (1 - raw / max) * Math.max(1, 4 - seal) : 0;

    objectives.push({
      objective_id: obj.id,
      title: obj.title,
      weight: obj.weight,
      raw_score: raw,
      max_score: max,
      seal_level: seal,
      gap,
      questions: questionResults,
    });
  }

  let overall = 0;
  for (const obj of objectives) {
    if (obj.max_score > 0) {
      overall += (obj.raw_score / obj.max_score) * obj.weight * 100;
    }
  }

  const weightSum = objectives.filter(o => o.max_score > 0).reduce((s, o) => s + o.weight, 0);
  if (weightSum > 0 && weightSum < 1) {
    overall = overall / weightSum;
  }

  const gap_report: GapItem[] = [];
  for (const obj of objectives) {
    for (const qr of obj.questions) {
      if (qr.value !== 'n/a' && qr.points_possible > 0 && qr.points_earned < qr.points_possible) {
        const g = obj.weight * (1 - (qr.points_earned / qr.points_possible)) * Math.max(1, 4 - obj.seal_level);
        gap_report.push({ objective_id: obj.objective_id, question_id: qr.question_id, tier: qr.tier, gap_score: g, priority: 0 });
      }
    }
  }
  gap_report.sort((a, b) => b.gap_score - a.gap_score);
  // Deduplicate: keep only the highest-gap entry per question_id
  const seen = new Set<string>();
  const deduped: GapItem[] = [];
  for (const g of gap_report) {
    if (!seen.has(g.question_id)) { seen.add(g.question_id); deduped.push(g); }
  }
  gap_report.length = 0;
  gap_report.push(...deduped);
  gap_report.forEach((g, i) => { g.priority = i + 1; });

  const overallSeal = Math.min(...objectives.map(o => o.seal_level));
  const c5_supplementary = computeC5Supplementary(answers, criteria);

  return {
    assessment_id: assessmentId,
    variant: meta.variant as any,
    country_code: meta.country_code,
    scope_ids: meta.scope_ids as any,
    role: meta.role as any,
    overall_score: Math.min(100, Math.max(0, overall)),
    seal_level: overallSeal,
    objectives,
    gap_report,
    c5_supplementary,
    instrument_version: meta.instrument_version,
    assessed_at: new Date().toISOString(),
  };
}
