import { useState, useEffect } from 'react';
import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import { resolvePlaceholders, displayTitle } from '../../shared/src/tier-resolution.js';

interface QuestionResult {
  question_id: string;
  tier: 'bloc' | 'national' | 'single';
  value: string;
  points_earned: number;
  points_possible: number;
  seal_contribution: number;
  counts_toward_seal: boolean;
}

interface ObjectiveResult {
  objective_id: string;
  title: string;
  seal_level: number;
  raw_score: number;
  max_score: number;
  questions: QuestionResult[];
}

interface Country {
  code: string; name: string; adj?: string;
  national_admin_label?: string; emergency_regime?: string;
}

interface Props {
  objectives: ObjectiveResult[];
  criteria: CriteriaFile;
  country?: Country;
  variant: 'EU-CSF' | 'Generalized';
  overallSeal: number;
  /** Level badge label. CSI passes "CSL" (it never says "SEAL"); EU-CSF defaults by variant. */
  levelLabel?: string;
}

const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function SealDots({ level, max = 4 }: { level: number; max?: number }) {
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: max + 1 }, (_, i) => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: i <= level ? SEAL_COLORS[level] : '#e5e7eb' }}
        />
      ))}
    </span>
  );
}

function getQuestionMeta(criteria: CriteriaFile, qid: string, tier: string, ctx: { variant: 'EU-CSF' | 'Generalized'; country?: Country }) {
  for (const obj of criteria.objectives) {
    const q = obj.questions.find((q: Question) => q.id === qid);
    if (!q) continue;
    const title = displayTitle(q, ctx.variant);
    if (q.type === 'single') {
      const text = (ctx.variant === 'Generalized' && q.text_generalized) ? q.text_generalized : q.text;
      return { title, text: resolvePlaceholders(text, ctx), source: q.source?.clause ?? '', supplementary: q.supplementary_info };
    }
    if (q.type === 'tiered') {
      const tierData = tier === 'national' ? q.tiers.national : q.tiers.bloc;
      if (!tierData) return null;
      return { title, text: resolvePlaceholders(tierData.text, ctx), source: tierData.source?.clause ?? '', supplementary: q.supplementary_info };
    }
  }
  return null;
}

function questionStatus(q: QuestionResult, overallSeal: number): 'blocking' | 'gap' | 'partial' | 'planned' | 'ok' | 'na' {
  if (q.value === 'n/a') return 'na';
  if (q.value === 'yes') return 'ok';
  if (q.value === 'partial') return 'partial';
  if (q.value === 'planned') return 'planned';
  // no
  if (q.seal_contribution > overallSeal) return 'blocking';
  return 'gap';
}

const STATUS_CONFIG = {
  blocking: { label: 'Blocking', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', dot: '●' },
  gap:      { label: 'Gap',      bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: '●' },
  partial:  { label: 'Partial',  bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: '◐' },
  planned:  { label: 'Planned',  bg: 'bg-blue-50',  border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700',  dot: '→' },
  ok:       { label: 'OK',       bg: '',            border: 'border-transparent', badge: 'bg-green-100 text-green-700', dot: '✓' },
  na:       { label: 'N/A',      bg: 'bg-gray-50',  border: 'border-transparent', badge: 'bg-gray-100 text-gray-500', dot: '–' },
};

export default function ObjectiveAccordion({ objectives, criteria, country, variant, overallSeal, levelLabel }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ctx = { variant, country };

  // Open and scroll to objective targeted by URL hash (e.g. #obj-SOV-5)
  function handleHash(hash: string) {
    if (!hash.startsWith('#obj-')) return;
    const objId = hash.slice(5);
    setOpen(prev => new Set([...prev, objId]));
    setTimeout(() => {
      document.getElementById(`obj-${objId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  useEffect(() => {
    handleHash(window.location.hash);
    const onHashChange = () => handleHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {objectives.map(obj => {
        const seal = obj.seal_level;
        const color = SEAL_COLORS[seal] ?? '#6b7280';
        const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
        const isOpen = open.has(obj.objective_id);

        const blockingCount = obj.questions.filter(q => questionStatus(q, overallSeal) === 'blocking').length;

        return (
          <div key={obj.objective_id} id={`obj-${obj.objective_id}`} className="border border-gray-100 rounded-lg overflow-hidden scroll-mt-4">
            {/* Header row — clickable */}
            <button
              onClick={() => toggle(obj.objective_id)}
              className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 transition text-left"
            >
              <div className="w-16 text-xs font-mono text-gray-500 shrink-0">{obj.objective_id}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1 truncate">{obj.title}</div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
              <div className="text-sm font-medium shrink-0" style={{ color }}>{pct}%</div>
              {blockingCount > 0 && (
                <div className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">
                  {blockingCount} blocking
                </div>
              )}
              <div className="text-xs px-2 py-0.5 rounded-full text-white font-medium shrink-0" style={{ backgroundColor: color }}>
                {levelLabel ?? (variant === 'Generalized' ? 'Level' : 'SEAL')} {seal}
              </div>
              <div className="text-gray-400 text-xs shrink-0">{isOpen ? '▲' : '▼'}</div>
            </button>

            {/* Expanded question table */}
            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Question</th>
                      <th className="px-3 py-2 font-medium">Tier</th>
                      <th className="px-3 py-2 font-medium w-64">Text</th>
                      <th className="px-3 py-2 font-medium">Answer</th>
                      <th className="px-3 py-2 font-medium">Points</th>
                      <th className="px-3 py-2 font-medium">Level req.</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obj.questions.map((q, i) => {
                      const meta = getQuestionMeta(criteria, q.question_id, q.tier, ctx);
                      const status = questionStatus(q, overallSeal);
                      const cfg = STATUS_CONFIG[status];
                      return (
                        <tr key={i} className={`border-t border-gray-100 ${cfg.bg}`}>
                          <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{q.question_id}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{q.tier}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-xs">
                            <span title={meta?.text ?? ''} className="line-clamp-2 block">
                              {meta?.title ?? q.question_id}
                              {meta?.text && <span className="text-gray-400 ml-1">— {meta.text.slice(0, 80)}{meta.text.length > 80 ? '…' : ''}</span>}
                            </span>
                            {meta?.source && <span className="text-gray-400 block mt-0.5">{meta.source}</span>}
                          </td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {q.value === 'yes' ? '✅ yes' : q.value === 'no' ? '❌ no' : q.value === 'partial' ? '◐ partial' : q.value === 'planned' ? '→ planned' : '– n/a'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {q.points_possible > 0 ? `${q.points_earned}/${q.points_possible}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <SealDots level={q.seal_contribution} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
