import { useEffect, useState } from 'react';
import type { CriteriaFile, ControlProfile, Question } from '../../shared/src/schema';
import { structuralAnswers, type StructuralAnswer } from '../../shared/src/structural-answers';
import { displayTitle } from '../../shared/src/tier-resolution';
import { readCache, setAnswer } from '../lib/local-cache';

/**
 * End-of-flow transparency panel: the questions whose answer is fully determined by the
 * declared control profile (jurisdiction, data residency, operator location) are
 * auto-answered rather than asked. They COUNT in the score (the worker merges them before
 * scoring); here we make every one visible — value, the reason the profile fixes it, and
 * its source anchor — and let the user override any of them (an override is a manual answer
 * that wins over the derived default, both in the submit payload and the worker merge).
 */

function sourceOf(q: Question): string {
  const s = (q as any).source ?? (q as any).tiers?.bloc?.source;
  return s ? `${s.doc} ${s.clause}` : '';
}

export default function AutoAnswers({ id, criteria }: { id: string; criteria: CriteriaFile }) {
  const [items, setItems] = useState<StructuralAnswer[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, 'yes' | 'no'>>({});

  const qById = (qid: string): Question | undefined =>
    criteria.objectives.flatMap(o => o.questions).find(q => q.id === qid);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let profile: ControlProfile | null = null;
      try {
        const raw = localStorage.getItem(`csi:${id}:profile`);
        if (raw) profile = JSON.parse(raw) as ControlProfile;
      } catch { /* ignore */ }
      if (!profile) {
        try {
          const res = await fetch(`/api/assessments/${id}`);
          if (res.ok) {
            const rec = await res.json() as Record<string, unknown>;
            const cp = rec.control_profile;
            if (cp) profile = (typeof cp === 'string' ? JSON.parse(cp) : cp) as ControlProfile;
          }
        } catch { /* offline */ }
      }
      if (cancelled) return;
      setItems(profile ? structuralAnswers(profile, criteria) : []);
      // Pick up any existing manual overrides from the cache.
      const cached = readCache(id) ?? {};
      const ans = (cached.answers as Record<string, { value?: string }>) ?? {};
      const ov: Record<string, 'yes' | 'no'> = {};
      if (profile) for (const sa of structuralAnswers(profile, criteria)) {
        const v = ans[sa.answerKey]?.value;
        if (v === 'yes' || v === 'no') ov[sa.answerKey] = v;
      }
      setOverrides(ov);
    }
    load();
    return () => { cancelled = true; };
  }, [id, criteria]);

  function override(sa: StructuralAnswer, value: 'yes' | 'no') {
    setAnswer(id, sa.answerKey, { tier: sa.tier, value });
    setOverrides(o => ({ ...o, [sa.answerKey]: value }));
  }
  function clearOverride(sa: StructuralAnswer) {
    // Remove the manual answer so the derived default applies again.
    const cached = readCache(id) ?? {};
    const ans = (cached.answers as Record<string, unknown>) ?? {};
    delete ans[sa.answerKey];
    cached.answers = ans;
    try { localStorage.setItem(`csi:${id}`, JSON.stringify(cached)); } catch { /* ignore */ }
    setOverrides(o => { const n = { ...o }; delete n[sa.answerKey]; return n; });
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">
        Answers set by your declared infrastructure ({items.length})
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        These answers follow directly from your control profile, so they were filled in
        automatically rather than asked. They count toward your score exactly like a typed
        answer. Override any one if your situation differs.
      </p>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
        {items.map(sa => {
          const q = qById(sa.questionId);
          const title = q ? displayTitle(q, 'Generalized') : sa.questionId;
          const src = q ? sourceOf(q) : '';
          const effective = overrides[sa.answerKey] ?? sa.value;
          const isOverridden = overrides[sa.answerKey] != null && overrides[sa.answerKey] !== sa.value;
          return (
            <div key={sa.answerKey} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {title}
                    <span className="font-mono text-xs text-gray-400 ml-2">{sa.questionId}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{sa.reason}</p>
                  {src && <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{src}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(['yes', 'no'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => override(sa, v)}
                      className={`text-xs px-2 py-1 rounded border transition ${
                        effective === v
                          ? v === 'yes'
                            ? 'bg-green-100 border-green-300 text-green-800 font-medium'
                            : 'bg-red-100 border-red-300 text-red-800 font-medium'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {v === 'yes' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
              {isOverridden && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Overridden (derived: {sa.value === 'yes' ? 'Yes' : 'No'}).
                  <button type="button" className="ml-1 underline" onClick={() => clearOverride(sa)}>reset</button>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
