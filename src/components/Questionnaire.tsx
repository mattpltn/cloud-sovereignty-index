import { useState, useEffect, useCallback } from 'react';
import { resolvePlaceholders, deriveOperatorLabel, operatorForLayer, reframeOperator } from '../../shared/src/tier-resolution.js';
import type { CriteriaFile, Country, Question, ControlProfile } from '../../shared/src/schema.js';
import type { AnswerMap, EvidenceLevel } from '../../shared/src/types.js';
import { setAnswer, flushNow, readCache, writeCache } from '../lib/local-cache.js';
import { evaluate } from '../../shared/src/relevance.js';
import { STRUCTURAL_QUESTION_IDS } from '../../shared/src/structural-answers.js';

const STRUCTURAL_IDS = new Set(STRUCTURAL_QUESTION_IDS);

const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  self_declared: 'Self-declared',
  documented: 'Documented',
  audited: 'Audited',
  operationally_tested: 'Operationally tested',
};

type FidelityLevel = 'direct' | 'inferred' | 'csi';
interface FidelityTagInfo { framework: string; fidelity: FidelityLevel; rationale?: string }

function FidelityTag({ info }: { info: FidelityTagInfo }) {
  const [open, setOpen] = useState(false);
  const colors: Record<FidelityLevel, string> = {
    direct: 'bg-green-50 text-green-700',
    inferred: 'bg-amber-50 text-amber-700',
    csi: 'bg-purple-50 text-purple-700',
  };
  const labels: Record<FidelityLevel, string> = { direct: 'Direct', inferred: 'Inferred', csi: 'CSI' };
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${colors[info.fidelity]}`}>
        {info.framework}: {labels[info.fidelity]}
        {info.fidelity === 'inferred' && info.rationale && (
          <button onClick={() => setOpen(o => !o)} className="ml-0.5 opacity-70 hover:opacity-100">
            {open ? '▴' : '▾'}
          </button>
        )}
      </span>
      {open && info.rationale && (
        <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-relaxed">
          {info.rationale}
        </span>
      )}
    </span>
  );
}

function EvidenceLevelSelect({ answerKey, level, onChange }: {
  answerKey: string;
  level: EvidenceLevel | undefined;
  onChange: (key: string, level: EvidenceLevel) => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-gray-400">Evidence basis:</span>
      <select
        value={level ?? 'self_declared'}
        onChange={e => onChange(answerKey, e.target.value as EvidenceLevel)}
        className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-600 bg-white focus:outline-none focus:border-blue-400"
      >
        {(Object.keys(EVIDENCE_LEVEL_LABELS) as EvidenceLevel[]).map(l => (
          <option key={l} value={l}>{EVIDENCE_LEVEL_LABELS[l]}</option>
        ))}
      </select>
    </div>
  );
}

interface Props {
  id: string;
  objectiveId: string;
  criteria: CriteriaFile;
  country?: Country;
  variant: 'EU-CSF' | 'Generalized';
  allObjectiveIds: string[];
  selectedFrameworks?: string[];
  customerSelectedAcIds?: string[];
  controlProfile?: ControlProfile;
  isEu?: boolean;
}

type AnswerValue = 'yes' | 'no' | 'partial' | 'planned' | 'n/a';

const ANSWER_LABELS: Record<AnswerValue, string> = { yes: 'Yes', no: 'No', partial: 'Partial', planned: 'Planned', 'n/a': 'N/A' };

const ANSWER_COLORS: Record<AnswerValue, string> = {
  yes: 'bg-green-100 border-green-400 text-green-800',
  no: 'bg-red-100 border-red-400 text-red-800',
  partial: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  planned: 'bg-blue-100 border-blue-400 text-blue-800',
  'n/a': 'bg-gray-100 border-gray-400 text-gray-600',
};

function AnswerButtons({ questionKey, value, onAnswer, answerValues }: {
  questionKey: string;
  value: AnswerValue | undefined;
  onAnswer: (key: string, v: AnswerValue) => void;
  answerValues: AnswerValue[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {answerValues.map(v => (
        <button
          key={v}
          onClick={() => onAnswer(questionKey, v)}
          className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition ${
            value === v ? ANSWER_COLORS[v] : 'border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          {ANSWER_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

function activeFrameworkTags(q: Question, fw: Set<string>): string {
  const tags: string[] = [];
  if ((q.applies_to_eu_csf ?? false) && fw.has('eu_csf')) tags.push('EU-CSF');
  if ((q.applies_to_c3a ?? false) && fw.has('c3a')) tags.push('C3A');
  if ((q.applies_to_csi_composite ?? false) && fw.has('csi_composite')) tags.push('CSI');
  if (((q as any).applies_to_cada ?? false) && fw.has('cada')) tags.push('CADA');
  return tags.join(' · ');
}

function questionFidelityTags(q: Question, fw: Set<string>): FidelityTagInfo[] {
  const tags: FidelityTagInfo[] = [];
  if (fw.has('eu_csf') && q.applies_to_eu_csf && (q as any).eu_csf_fidelity) {
    tags.push({ framework: 'EU-CSF', fidelity: (q as any).eu_csf_fidelity, rationale: (q as any).eu_csf_fidelity_rationale });
  }
  if (fw.has('c3a') && q.applies_to_c3a && (q as any).c3a_fidelity) {
    tags.push({ framework: 'C3A', fidelity: (q as any).c3a_fidelity, rationale: (q as any).c3a_fidelity_rationale });
  }
  if (fw.has('cada') && (q as any).applies_to_cada && (q as any).cada_fidelity) {
    tags.push({ framework: 'CADA', fidelity: (q as any).cada_fidelity, rationale: (q as any).cada_fidelity_rationale });
  }
  return tags;
}

function sourceLabel(q: Question, fw: Set<string>, clauseDoc: string, clauseRef: string): string {
  const fwTag = activeFrameworkTags(q, fw);
  const clause = clauseDoc && clauseRef ? `${clauseDoc} ${clauseRef}`.trim() : '';
  if (fwTag && clause) return `${fwTag} — ${clause}`;
  return fwTag || clause;
}

export default function Questionnaire({ id, objectiveId, criteria, country, variant, allObjectiveIds, selectedFrameworks = ['csi_composite'], customerSelectedAcIds = [], controlProfile, isEu = false }: Props) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const objective = criteria.objectives.find(o => o.id === objectiveId);

  const fw = new Set(selectedFrameworks);
  const c3aOnly = fw.has('c3a') && fw.size === 1;
  const acIdSet = new Set(customerSelectedAcIds);

  // Filter questions to those relevant to at least one selected framework
  // AC questions also require customer selection
  function isQuestionVisible(q: Question): boolean {
    if (q.c3a_tier === 'additional') {
      // Show AC only if C3A is selected AND customer selected this AC
      return fw.has('c3a') && acIdSet.has(q.id);
    }
    const frameworkCheck = (fw.has('eu_csf') && q.applies_to_eu_csf) ||
           (fw.has('c3a') && q.applies_to_c3a) ||
           (fw.has('csi_composite') && q.applies_to_csi_composite) ||
           (fw.has('cada') && (q as any).applies_to_cada);
    if (!frameworkCheck) return false;
    // Control-profile gate: apply show_when for all frameworks when a control profile is set
    const isCsiMode = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
    // Structural questions are auto-answered from the control profile (jurisdiction,
    // residency, operator location) and surfaced on the review page — never asked here.
    if (isCsiMode && controlProfile && STRUCTURAL_IDS.has(q.id)) return false;
    const showWhen: string | undefined = (q as any).relevance?.show_when;
    if (showWhen && controlProfile) {
      if (!evaluate(showWhen, controlProfile)) return false;
    }
    // EU exclusion: csi_presentation.treatment=exclude_non_eu hides question for non-EU countries
    if (isCsiMode) {
      const pres = (q as any).csi_presentation;
      if (pres?.treatment === 'exclude_non_eu' && !isEu) return false;
    }
    // Fallback questions (parent_criterion_id set) only appear when parent is answered 'no'
    if (q.parent_criterion_id) {
      const parentId = q.parent_criterion_id;
      const parentQ = criteria.objectives.flatMap(o => o.questions).find(p => p.id === parentId);
      if (!parentQ) return false;
      const parentAnswer = parentQ.type === 'tiered'
        ? (answers[`${parentId}:national`]?.value ?? answers[`${parentId}:bloc`]?.value)
        : answers[parentId]?.value;
      return parentAnswer === 'no';
    }
    return true;
  }

  // 'planned' (25% credit) is only available in CSI Composite Generalized mode
  const isGeneralizedCsi = variant === 'Generalized' && fw.has('csi_composite');
  const visibleAnswerValues: AnswerValue[] = c3aOnly
    ? ['yes', 'no', 'n/a']
    : isGeneralizedCsi
    ? ['yes', 'no', 'partial', 'planned', 'n/a']
    : ['yes', 'no', 'partial', 'n/a'];
  // When C3A is one of multiple selected frameworks, warn if "planned" is selected on a C3A question
  const c3aInMix = fw.has('c3a') && !c3aOnly;

  useEffect(() => {
    const cached = readCache(id);
    if (cached?.answers) setAnswers(cached.answers as AnswerMap);
  }, [id]);

  const currentObjIndex = allObjectiveIds.indexOf(objectiveId);
  const nextObj = allObjectiveIds[currentObjIndex + 1];
  const prevObj = allObjectiveIds[currentObjIndex - 1];

  const handleAnswer = useCallback((answerKey: string, value: AnswerValue) => {
    const parts = answerKey.split(':');
    const tier = parts[1] ?? 'single';
    setAnswers(prev => {
      const existing = prev[answerKey];
      const ans = { tier, value, evidence_level: existing?.evidence_level };
      const next = { ...prev, [answerKey]: ans };
      const cached = readCache(id) ?? {};
      cached.answers = next;
      writeCache(id, cached);
      setAnswer(id, answerKey, ans);
      return next;
    });
  }, [id]);

  const handleEvidenceLevel = useCallback((answerKey: string, level: EvidenceLevel) => {
    setAnswers(prev => {
      const existing = prev[answerKey];
      if (!existing) return prev;
      const ans = { ...existing, evidence_level: level };
      const next = { ...prev, [answerKey]: ans };
      const cached = readCache(id) ?? {};
      cached.answers = next;
      writeCache(id, cached);
      setAnswer(id, answerKey, ans);
      return next;
    });
  }, [id]);

  const handleNext = useCallback(() => {
    flushNow(id);
    if (nextObj) window.location.href = `/assess/${id}/${nextObj}`;
    else window.location.href = `/assess/${id}/review`;
  }, [id, nextObj]);

  const handleBack = useCallback(() => {
    flushNow(id);
    if (prevObj) window.location.href = `/assess/${id}/${prevObj}`;
    else window.location.href = `/assess/${id}/created`;
  }, [id, prevObj]);

  const ctx = { variant, country };

  // CSI mode reframes "the cloud service provider" to the actual operator (you / a
  // provider / a vendor) from the control profile. C3A/EU-CSF stay source-faithful.
  const isCsiComposite = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
  // Reframe the "cloud service provider" subject to the actor responsible at the
  // question's concern layer (relevance.layer): facility questions (SOV-8 → L1)
  // address the data-center provider, ops questions the cloud operator, etc.
  const resolveText = (text: string, concernLayer?: string) => {
    const resolved = resolvePlaceholders(text, ctx);
    if (!isCsiComposite) return resolved;
    const label = concernLayer ? operatorForLayer(controlProfile, concernLayer) : deriveOperatorLabel(controlProfile);
    // Bare "the provider" is only safe to re-aim for layer-anchored questions, where the
    // concern-layer operator is unambiguously the question's subject.
    return reframeOperator(resolved, label, { includeBareProvider: !!concernLayer });
  };
  // The verbatim source criterion text (placeholders resolved, but NOT reframed or
  // CSI-rewritten) — revealed under each question so every amendment stays auditable.
  const originalSource = (text?: string) => (text ? resolvePlaceholders(text, ctx) : undefined);

  if (!objective) return <div className="text-red-600">Objective {objectiveId} not found</div>;

  const visibleQuestions = objective.questions.filter(isQuestionVisible);

  // Questions hidden by control-profile scope (CSI mode only)
  const isCsiMode = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
  // Questions hidden by scope are listed in a quiet disclosure below. The structural
  // risks they may carry are surfaced once, consolidated, on the review page
  // (ScopeFindings → unaskedFiredRisks) — never silently dropped, never per-objective.
  const scopeHiddenQuestions = isCsiMode && controlProfile
    ? objective.questions.filter(q => {
        if (STRUCTURAL_IDS.has(q.id)) return false; // auto-answered → shown in the review panel
        const showWhen: string | undefined = (q as any).relevance?.show_when;
        return showWhen ? !evaluate(showWhen, controlProfile) : false;
      })
    : [];

  // Count answered: each tiered question needs at least the national (or bloc) answered
  const answeredCount = visibleQuestions.filter(q => {
    if (q.type === 'single') return !!answers[q.id];
    if (country && q.tiers.national) return !!answers[`${q.id}:national`];
    return !!answers[`${q.id}:bloc`] || !!answers[q.id];
  }).length;
  const totalCount = visibleQuestions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
        <span>{answeredCount} / {totalCount} answered</span>
        <span>{allObjectiveIds.indexOf(objectiveId) + 1} of {allObjectiveIds.length}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {visibleQuestions.map(q => {
        const isExpanded = expanded[q.id];

        // Determine level badge prefix: CADA-only → UAL, CSI-only → '' (SEAL is EU-CSF/C3A concept), C3A-only → '', else SEAL
        const cadaOnly = (q as any).applies_to_cada && !q.applies_to_eu_csf && !q.applies_to_csi_composite;
        const cadaFramework = fw.has('cada') && !fw.has('eu_csf') && !fw.has('csi_composite');
        const csiOnly = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
        const levelPrefix = (cadaOnly && cadaFramework) ? 'UAL'
          : (csiOnly || (fw.has('c3a') && !fw.has('eu_csf') && !fw.has('csi_composite'))) ? ''
          : 'SEAL';

        if (q.type === 'single') {
          const val = answers[q.id]?.value as AnswerValue | undefined;
          const evidLevel = answers[q.id]?.evidence_level;
          const isCsiModeQ = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
          const csiPres = isCsiModeQ && !isEu ? (q as any).csi_presentation : undefined;
          const csiPresText = csiPres?.variants?.non_eu?.text;
          const qText = csiPresText ?? ((variant === 'Generalized' && q.text_generalized) ? q.text_generalized : q.text);
          const qTitle = (csiPresText && csiPres?.title) ? csiPres.title
            : (variant === 'Generalized' && q.title_generalized) ? q.title_generalized : q.title;
          return (
            <QuestionCard
              key={q.id}
              id={q.id}
              title={qTitle}
              text={resolveText(qText, (q as any).relevance?.layer)}
              originalText={originalSource(q.text)}
              supplementary={q.supplementary_info}
              sealContribution={q.seal_contribution}
              points={q.points}
              source={sourceLabel(q, fw, q.source.doc, q.source.clause)}
              isAdditionalCriterion={q.c3a_tier === 'additional'}
              value={val}
              onAnswer={v => handleAnswer(q.id, v)}
              evidenceLevel={evidLevel}
              onEvidenceLevel={level => handleEvidenceLevel(q.id, level)}
              answerValues={visibleAnswerValues}
              warnPlannedForC3a={c3aInMix && q.applies_to_c3a}
              fidelityTags={questionFidelityTags(q, fw)}
              levelPrefix={levelPrefix}
            />
          );
        }

        // Tiered question
        const tieredTitle = (variant === 'Generalized' && q.title_generalized) ? q.title_generalized : q.title;
        const hasNational = !!country && !!q.tiers.national;
        const natKey = `${q.id}:national`;
        const blocKey = `${q.id}:bloc`;
        const natVal = answers[natKey]?.value as AnswerValue | undefined;
        const blocVal = answers[blocKey]?.value as AnswerValue | undefined;
        const natSatisfied = natVal === 'yes';
        // Generalized variant has no supranational bloc — national tier is the only tier
        const isGeneralized = variant === 'Generalized';
        // Show bloc when:
        //  - no national tier exists (bloc is the only content — always show regardless of variant)
        //  - or: national tier exists but wasn't satisfied (show bloc as EU-tier fallback, EU mode only)
        const showBloc = !hasNational || (!isGeneralized && natVal !== undefined && !natSatisfied);

        const fidelityTags = questionFidelityTags(q, fw);

        // Non-EU CSI mode: if question has a re-aimed non_eu text, render as flat single card
        const isCsiModeQ = fw.has('csi_composite') && !fw.has('eu_csf') && !fw.has('c3a') && !fw.has('cada');
        const csiPresTiered = isCsiModeQ && !isEu ? (q as any).csi_presentation : undefined;
        const csiPresNonEu = csiPresTiered?.variants?.non_eu;
        const csiPresText = csiPresNonEu?.shown !== false ? csiPresNonEu?.text : undefined;
        if (csiPresText) {
          return (
            <QuestionCard
              key={q.id}
              id={q.id}
              title={csiPresTiered?.title ?? tieredTitle}
              text={resolveText(csiPresText, (q as any).relevance?.layer)}
              originalText={originalSource((q.tiers?.bloc as any)?.text ?? (q as any).text)}
              supplementary={q.supplementary_info}
              sealContribution={q.tiers.bloc.seal_contribution}
              points={q.tiers.bloc.points}
              source={sourceLabel(q, fw, q.tiers.bloc.source.doc, q.tiers.bloc.source.clause)}
              isAdditionalCriterion={q.c3a_tier === 'additional'}
              value={answers[blocKey]?.value as AnswerValue | undefined}
              onAnswer={v => handleAnswer(blocKey, v)}
              evidenceLevel={answers[blocKey]?.evidence_level}
              onEvidenceLevel={level => handleEvidenceLevel(blocKey, level)}
              answerValues={visibleAnswerValues}
              warnPlannedForC3a={c3aInMix && q.applies_to_c3a}
              fidelityTags={fidelityTags}
              levelPrefix={levelPrefix}
            />
          );
        }

        return (
          <div key={q.id} className="border border-gray-200 rounded-xl overflow-hidden">
            {fidelityTags.length > 0 && (
              <div className="px-5 pt-3 pb-0 flex flex-wrap gap-1.5">
                {fidelityTags.map(tag => <FidelityTag key={tag.framework} info={tag} />)}
              </div>
            )}
            {hasNational && (
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="text-xs font-mono text-gray-400 mr-2">{q.id}</span>
                    <span className="text-sm font-medium">{tieredTitle}</span>
                    <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {country!.name} tier
                    </span>
                  </div>
                  {levelPrefix !== '' && (
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {levelPrefix} {q.tiers.national!.seal_contribution} · {q.tiers.national!.points}pt
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mb-4 leading-relaxed">
                  {resolveText(
                    (isGeneralized && q.tiers.national!.text_generalized) ? q.tiers.national!.text_generalized : q.tiers.national!.text,
                    (q as any).relevance?.layer
                  )}
                </p>
                <AnswerButtons questionKey={natKey} value={natVal} onAnswer={handleAnswer} answerValues={visibleAnswerValues} />
                {(natVal === 'yes' || natVal === 'partial') && (
                  <EvidenceLevelSelect answerKey={natKey} level={answers[natKey]?.evidence_level} onChange={handleEvidenceLevel} />
                )}
                {natSatisfied && !isGeneralized && (
                  <p className="mt-3 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                    ✓ {country!.name} tier satisfied — EU tier is automatically satisfied.
                  </p>
                )}
                <div className="mt-2 text-xs text-gray-400">
                  {sourceLabel(q, fw, q.tiers.national!.source.doc, q.tiers.national!.source.clause)}
                </div>
                <SourceDetail
                  originalText={originalSource(q.tiers.national!.text)}
                  shownText={resolveText((isGeneralized && q.tiers.national!.text_generalized) ? q.tiers.national!.text_generalized : q.tiers.national!.text, (q as any).relevance?.layer)}
                  supplementary={q.supplementary_info}
                />
              </div>
            )}

            {showBloc && (
              <div className={`p-5 ${hasNational ? 'bg-gray-50' : ''}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    {!hasNational && <span className="text-xs font-mono text-gray-400 mr-2">{q.id}</span>}
                    {!hasNational && <span className="text-sm font-medium">{tieredTitle}</span>}
                    {hasNational && (
                      <span className="text-sm font-medium text-gray-500">
                        Fallback: EU tier
                        <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                          EU tier
                        </span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {levelPrefix || 'SEAL'} {q.tiers.bloc.seal_contribution} · {q.tiers.bloc.points}pt
                  </span>
                </div>
                {hasNational && (
                  <p className="text-xs text-gray-500 mb-3 italic">
                    Since the {country!.name}-level requirement wasn't met, you can still satisfy the EU-level requirement.
                  </p>
                )}
                <p className="text-sm text-gray-700 mb-4 leading-relaxed">
                  {resolveText(
                    (isGeneralized && q.tiers.bloc.text_generalized) ? q.tiers.bloc.text_generalized : q.tiers.bloc.text,
                    (q as any).relevance?.layer
                  )}
                </p>
                <AnswerButtons questionKey={blocKey} value={blocVal} onAnswer={handleAnswer} answerValues={visibleAnswerValues} />
                {(blocVal === 'yes' || blocVal === 'partial') && (
                  <EvidenceLevelSelect answerKey={blocKey} level={answers[blocKey]?.evidence_level} onChange={handleEvidenceLevel} />
                )}
                <div className="mt-2 text-xs text-gray-400">
                  {sourceLabel(q, fw, q.tiers.bloc.source.doc, q.tiers.bloc.source.clause)}
                </div>
                <SourceDetail
                  originalText={originalSource(q.tiers.bloc.text)}
                  shownText={resolveText((isGeneralized && q.tiers.bloc.text_generalized) ? q.tiers.bloc.text_generalized : q.tiers.bloc.text, (q as any).relevance?.layer)}
                  supplementary={q.supplementary_info}
                />
              </div>
            )}
          </div>
        );
      })}

      {scopeHiddenQuestions.length > 0 && (
        <details className="border border-gray-100 rounded-lg p-3 text-xs text-gray-400">
          <summary className="cursor-pointer select-none font-medium">
            {scopeHiddenQuestions.length} question{scopeHiddenQuestions.length !== 1 ? 's' : ''} hidden by your control profile
          </summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {scopeHiddenQuestions.map(q => (
              <li key={q.id}>
                <span className="font-mono mr-1">{q.id}</span>{q.title}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-gray-400">
            Not asked because of your declared infrastructure. Any structural risks these
            cover are recorded as findings on the review page.
            <a href={`/assess/${id}/scope`} className="ml-1 text-blue-500 hover:underline">Change profile</a>
          </p>
        </details>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button onClick={handleBack} className="text-sm text-gray-600 hover:text-gray-900">← Back</button>
        <button
          onClick={handleNext}
          className="bg-gray-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-700 transition"
        >
          {nextObj ? `Next: ${nextObj} →` : 'Review answers →'}
        </button>
      </div>
    </div>
  );
}

// Collapsible "Source criterion detail" shown under the source reference on every question
// across all frameworks (same look & feel as the CSI original-wording disclosure): the exact
// verbatim source control text (un-reframed) and the source criterion's supplementary detail.
// Present on every question that carries a source text — so the exact control behind each
// question is always auditable. `shownText` only flags when the displayed text was adapted.
function SourceDetail({ originalText, shownText, supplementary }: { originalText?: string; shownText?: string; supplementary?: string }) {
  const v = originalText?.trim();
  const s = supplementary?.trim();
  if (!v && !s) return null;
  // Show the verbatim source text when the displayed wording was adapted (CSI reframe /
  // generalized) — or as the disclosure's content when there's no supplementary detail to
  // show instead. This keeps a "Source criterion detail" affordance on every question
  // without repeating text that's already visible verbatim.
  const adapted = !!v && !!shownText && v !== shownText.trim();
  const showVerbatim = !!v && (adapted || !s);
  return (
    <details className="mt-1 text-xs text-gray-400">
      <summary className="cursor-pointer select-none hover:text-gray-600">Source criterion detail</summary>
      {showVerbatim && (
        <p className="mt-1 leading-relaxed text-gray-500 border-l-2 border-gray-200 pl-2 italic">
          {adapted && <span className="not-italic text-gray-400 block mb-0.5">Exact source control text:</span>}
          {v}
        </p>
      )}
      {s && (
        <p className="mt-1 leading-relaxed text-gray-500">{s}</p>
      )}
    </details>
  );
}

function QuestionCard({ id, title, text, originalText, supplementary, sealContribution, points, source, isAdditionalCriterion, value, onAnswer, evidenceLevel, onEvidenceLevel, answerValues, warnPlannedForC3a, fidelityTags, levelPrefix }: {
  id: string; title: string; text: string; originalText?: string; supplementary?: string; sealContribution: number; points: number; source: string;
  isAdditionalCriterion?: boolean; value: AnswerValue | undefined;
  onAnswer: (v: AnswerValue) => void; evidenceLevel?: EvidenceLevel; onEvidenceLevel?: (l: EvidenceLevel) => void;
  answerValues: AnswerValue[]; warnPlannedForC3a?: boolean; fidelityTags?: FidelityTagInfo[];
  levelPrefix?: string;
}) {
  return (
    <div className={`border rounded-xl p-5 transition ${value ? 'border-gray-200' : 'border-gray-300'}`}>
      {fidelityTags && fidelityTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {fidelityTags.map(tag => <FidelityTag key={tag.framework} info={tag} />)}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="text-xs font-mono text-gray-400 mr-2">{id}</span>
          <span className="text-sm font-medium">{title}</span>
          {isAdditionalCriterion && (
            <span className="ml-2 text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">AC</span>
          )}
        </div>
        {levelPrefix !== '' && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: ['#dc2626','#f97316','#eab308','#22c55e','#16a34a'][sealContribution] ?? '#6b7280' }}>
            {levelPrefix ?? 'SEAL'} {sealContribution}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700 mb-4 leading-relaxed">{text}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {answerValues.map(v => (
          <button key={v} onClick={() => onAnswer(v)}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition ${value === v ? ANSWER_COLORS[v] : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
            {ANSWER_LABELS[v]}
          </button>
        ))}
      </div>
      {(value === 'yes' || value === 'partial') && onEvidenceLevel && (
        <EvidenceLevelSelect answerKey={id} level={evidenceLevel} onChange={(_key, l) => onEvidenceLevel(l)} />
      )}
      {warnPlannedForC3a && value === 'planned' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2 mb-0">
          'Planned' is not recognised by C3A — counts as Not Met for C3A scoring.
        </p>
      )}
      <div className="mt-2 text-xs text-gray-400">Source: {source}</div>
      <SourceDetail originalText={originalText} shownText={text} supplementary={supplementary} />
    </div>
  );
}
