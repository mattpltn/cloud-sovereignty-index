import { useState } from 'react';
import type { CriteriaFile } from '../../shared/src/schema.js';
import type { AnswerMap } from '../../shared/src/types.js';
import { resolvePlaceholders } from '../../shared/src/tier-resolution.js';
import { readCache } from '../lib/local-cache.js';

interface Props {
  assessmentId: string;
  criteria: CriteriaFile;
  result: Record<string, unknown> | null;
}

type ExportFormat = 'json' | 'csv' | 'xlsx';

function buildJson(assessmentId: string, answers: AnswerMap, result: Record<string, unknown> | null) {
  return {
    csi_export_version: '1.0',
    assessment_id: assessmentId,
    exported_at: new Date().toISOString(),
    answers,
    result: result ?? undefined,
  };
}

function buildCsv(answers: AnswerMap, criteria: CriteriaFile): string {
  const rows: string[] = [
    '# Cloud Sovereignty Index — Assessment Export',
    '# answer column values: yes | no | partial | n/a',
    '#   yes = fully compliant, no = not compliant, partial = partially compliant (half points, no SEAL), n/a = not applicable (excluded)',
    '#',
    ['question_id', 'tier', 'objective_id', 'objective_title', 'question_title', 'question_text', 'answer', 'seal_contribution', 'points'].join(','),
  ];

  for (const obj of criteria.objectives) {
    for (const q of obj.questions) {
      if (q.type === 'single') {
        const ans = answers[q.id];
        const ctx = { variant: 'EU-CSF' as const };
        rows.push([
          q.id, 'single', obj.id,
          `"${obj.title.replace(/"/g, '""')}"`,
          `"${q.title.replace(/"/g, '""')}"`,
          `"${resolvePlaceholders(q.text, ctx).replace(/"/g, '""')}"`,
          ans?.value ?? '',
          q.seal_contribution,
          q.points,
        ].join(','));
      } else {
        // bloc tier
        const ctx = { variant: 'EU-CSF' as const };
        const blocAns = answers[`${q.id}:bloc`];
        rows.push([
          q.id, 'bloc', obj.id,
          `"${obj.title.replace(/"/g, '""')}"`,
          `"${q.title.replace(/"/g, '""')}"`,
          `"${resolvePlaceholders(q.tiers.bloc.text, ctx).replace(/"/g, '""')}"`,
          blocAns?.value ?? '',
          q.tiers.bloc.seal_contribution,
          q.tiers.bloc.points,
        ].join(','));
        // national tier if present
        if (q.tiers.national) {
          const natAns = answers[`${q.id}:national`];
          rows.push([
            q.id, 'national', obj.id,
            `"${obj.title.replace(/"/g, '""')}"`,
            `"${q.title.replace(/"/g, '""')}"`,
            `"${resolvePlaceholders(q.tiers.national.text, ctx).replace(/"/g, '""')}"`,
            natAns?.value ?? '',
            q.tiers.national.seal_contribution,
            q.tiers.national.points,
          ].join(','));
        }
      }
    }
  }
  return rows.join('\n');
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportAnswers({ assessmentId, criteria, result }: Props) {
  const [status, setStatus] = useState<string>('');

  function getAnswers(): AnswerMap {
    const cached = readCache(assessmentId);
    return (cached?.answers as AnswerMap) ?? {};
  }

  function handleExport(format: ExportFormat) {
    const answers = getAnswers();
    const ts = new Date().toISOString().slice(0, 10);
    const base = `csi-assessment-${assessmentId.slice(0, 8)}-${ts}`;

    if (format === 'json') {
      const data = buildJson(assessmentId, answers, result);
      downloadBlob(JSON.stringify(data, null, 2), `${base}.json`, 'application/json');
    } else if (format === 'csv') {
      const csv = buildCsv(answers, criteria);
      downloadBlob(csv, `${base}.csv`, 'text/csv');
    }
    setStatus(`Downloaded ${format.toUpperCase()}`);
    setTimeout(() => setStatus(''), 2000);
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">Export answers:</span>
      <button
        onClick={() => handleExport('json')}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:border-gray-500 transition"
      >
        JSON
      </button>
      <button
        onClick={() => handleExport('csv')}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:border-gray-500 transition"
      >
        CSV
      </button>
      {status && <span className="text-xs text-green-600">{status}</span>}
    </div>
  );
}
