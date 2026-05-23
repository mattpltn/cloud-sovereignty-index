import { useState, useEffect } from 'react';
import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import type { C3aResult, C3aQuestionResult, C3aAttainmentBand } from '../../shared/src/types.js';

interface Props {
  c3a: C3aResult;
  criteria: CriteriaFile;
}

const BAND_COLOR: Record<C3aAttainmentBand, string> = {
  not_attained:           '#dc2626',
  partially_attained:     '#f97316',
  substantially_attained: '#eab308',
  fully_attained:         '#16a34a',
};

const BAND_LABEL: Record<C3aAttainmentBand, string> = {
  not_attained:           'Not Attained',
  partially_attained:     'Partially Attained',
  substantially_attained: 'Substantially Attained',
  fully_attained:         'Fully Attained',
};

function getQuestionTitle(criteria: CriteriaFile, qid: string): string {
  for (const obj of criteria.objectives) {
    const q = obj.questions.find((q: Question) => q.id === qid);
    if (q) return q.title;
  }
  return qid;
}

function QuestionRow({ qr, criteria }: { qr: C3aQuestionResult; criteria: CriteriaFile }) {
  const title = getQuestionTitle(criteria, qr.question_id);
  const isNa = qr.value === 'n/a';
  const bg = isNa ? 'bg-gray-50' : qr.passed ? '' : 'bg-red-50';
  const border = isNa ? 'border-transparent' : qr.passed ? 'border-transparent' : 'border-red-100';

  return (
    <tr className={`border-t border-gray-100 ${bg}`}>
      <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{qr.question_id}</td>
      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{qr.tier}</td>
      <td className="px-3 py-2 text-xs text-gray-700 max-w-xs">
        <span className="line-clamp-2 block">{title}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {qr.value === 'yes' ? (
          <span className="text-green-700 text-xs font-medium">✅ yes</span>
        ) : qr.value === 'no' ? (
          <span className="text-red-600 text-xs font-medium">❌ no</span>
        ) : (
          <span className="text-gray-400 text-xs">– n/a</span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isNa ? 'bg-gray-100 text-gray-400' : qr.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isNa ? 'N/A' : qr.passed ? 'Passed' : 'Failed'}
        </span>
        {qr.is_layer_a && !isNa && (
          <span className="ml-1 text-xs px-1 py-0.5 rounded bg-red-200 text-red-800 font-semibold">Layer A</span>
        )}
        {qr.is_additional_criterion && (
          <span className="ml-1 text-xs px-1 py-0.5 rounded bg-purple-100 text-purple-700">AC</span>
        )}
      </td>
    </tr>
  );
}

export default function C3aObjectiveAccordion({ c3a, criteria }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function handleHash(hash: string) {
    if (!hash.startsWith('#c3a-')) return;
    const objId = hash.slice(5);
    setOpen(prev => new Set([...prev, objId]));
    setTimeout(() => {
      document.getElementById(`c3a-${objId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const objIds = Object.keys(c3a.criterion.per_objective);

  return (
    <div className="space-y-2">
      {objIds.map(objId => {
        const crit = c3a.criterion.per_objective[objId];
        const ac = c3a.additional_criterion.per_objective[objId];
        const isOpen = open.has(objId);

        // Skip objectives with no applicable questions and no answers
        const allQuestions = [...(crit.questions ?? []), ...(ac?.questions ?? [])];
        if (crit.applicable === 0 && allQuestions.length === 0) return null;

        const obj = criteria.objectives.find(o => o.id === objId);
        const title = obj?.title ?? objId;

        const attainment = crit.applicable > 0 ? crit.attainment : null;
        const color = attainment ? BAND_COLOR[attainment] : '#9ca3af';
        const bandLabel = attainment ? BAND_LABEL[attainment] : 'No data';

        return (
          <div key={objId} id={`c3a-${objId}`} className="border border-gray-100 rounded-lg overflow-hidden scroll-mt-4">
            <button
              onClick={() => toggle(objId)}
              className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 transition text-left"
            >
              <div className="w-16 text-xs font-mono text-gray-500 shrink-0">{objId}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                {crit.applicable > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">{crit.passed}/{crit.applicable} criteria passed</div>
                )}
              </div>
              {attainment && (
                <div className="text-xs px-2 py-0.5 rounded-full text-white font-medium shrink-0"
                  style={{ backgroundColor: color }}>
                  {bandLabel}
                </div>
              )}
              <div className="text-gray-400 text-xs shrink-0">{isOpen ? '▲' : '▼'}</div>
            </button>

            {isOpen && allQuestions.length > 0 && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Question</th>
                      <th className="px-3 py-2 font-medium">Tier</th>
                      <th className="px-3 py-2 font-medium w-64">Title</th>
                      <th className="px-3 py-2 font-medium">Answer</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allQuestions.map((qr, i) => (
                      <QuestionRow key={i} qr={qr} criteria={criteria} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isOpen && allQuestions.length === 0 && (
              <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 italic">
                No questions answered for this objective.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
