import { useState, useRef } from 'react';
import type { CriteriaFile } from '../../shared/src/schema.js';
import type { AnswerMap } from '../../shared/src/types.js';
import { buildTemplateXlsx, parseXlsx } from '../lib/template-xlsx.js';

interface Props {
  criteria: CriteriaFile;
  countries: { EU: unknown[]; EEA_non_EU: unknown[]; non_EU: unknown[] };
  defaultVariant: 'EU-CSF' | 'Generalized';
}

type AnswerValue = 'yes' | 'no' | 'partial' | 'n/a';
const VALID_ANSWERS = new Set<string>(['yes', 'no', 'partial', 'n/a']);

function parseJson(text: string): { answers: AnswerMap; error?: string } {
  try {
    const data = JSON.parse(text);
    if (!data.answers || typeof data.answers !== 'object') {
      return { answers: {}, error: 'Invalid file: missing "answers" field.' };
    }
    return { answers: data.answers as AnswerMap };
  } catch {
    return { answers: {}, error: 'Could not parse JSON file.' };
  }
}

function parseCsv(text: string): { answers: AnswerMap; error?: string } {
  const lines = text.trim().split('\n');
  const header = lines.find(l => !l.trimStart().startsWith('#'));
  if (!header) return { answers: {}, error: 'CSV file appears empty.' };

  const cols = header.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idIdx = cols.indexOf('question_id');
  const tierIdx = cols.indexOf('tier');
  const ansIdx = cols.indexOf('answer');

  if (idIdx === -1 || tierIdx === -1 || ansIdx === -1) {
    return { answers: {}, error: 'CSV missing required columns: question_id, tier, answer.' };
  }

  const headerLineNum = lines.findIndex(l => !l.trimStart().startsWith('#'));
  const answers: AnswerMap = {};
  let skipped = 0;

  for (let i = headerLineNum + 1; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('#')) continue;
    const row = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const qid = row[idIdx];
    const tier = row[tierIdx] as 'bloc' | 'national' | 'single';
    const rawVal = row[ansIdx]?.toLowerCase().trim();
    if (!qid || !rawVal) continue;
    if (!VALID_ANSWERS.has(rawVal)) { skipped++; continue; }

    const key = tier === 'single' ? qid : `${qid}:${tier}`;
    answers[key] = { tier, value: rawVal as AnswerValue };
  }

  const msg = skipped > 0 ? `Loaded (${skipped} rows skipped — blank or invalid answer).` : undefined;
  return { answers, error: msg };
}

export default function ImportAssessment({ criteria, countries, defaultVariant }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleTemplateDownload() {
    try {
      const countrySelect = document.querySelector<HTMLSelectElement>('select[name="national_country"]');
      const selectedCountryCode = countrySelect?.value || undefined;
      const blob = await buildTemplateXlsx(
        criteria,
        countries as Parameters<typeof buildTemplateXlsx>[1],
        selectedCountryCode,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'csi-assessment-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Template generation failed:', err);
      alert('Failed to generate template: ' + String(err));
    }
  }

  async function handleImport() {
    if (!file) return;
    setError('');
    setLoading(true);

    try {
      let answers: AnswerMap;
      let parseError: string | undefined;
      let detectedCountry: string | undefined;
      let detectedCompany: string | undefined;
      let detectedVariant: 'EU-CSF' | 'Generalized' | undefined;
      let detectedFrameworks: string[] | undefined;

      if (file.name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const parsed = await parseXlsx(buf);
        answers = parsed.answers as AnswerMap;
        detectedCountry = parsed.country_code;
        detectedCompany = parsed.company_name;
        detectedVariant = parsed.variant;
        detectedFrameworks = parsed.selected_frameworks;
      } else if (file.name.endsWith('.json')) {
        ({ answers, error: parseError } = parseJson(await file.text()));
      } else {
        ({ answers, error: parseError } = parseCsv(await file.text()));
      }

      if (parseError && Object.keys(answers!).length === 0) {
        setError(parseError);
        setLoading(false);
        return;
      }

      const variant = detectedVariant ?? defaultVariant;

      // Read Turnstile token stored by the callback on the page
      const turnstile_token = (window as Record<string, unknown>).__turnstileToken as string || 'test-token';

      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant,
          national_country: detectedCountry || undefined,
          service_models: ['IaaS'],
          user_role: 'customer',
          company_name: detectedCompany || undefined,
          turnstile_token,
          selected_frameworks: detectedFrameworks ?? ['csi_composite'],
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: unknown };
        throw new Error(JSON.stringify(err.error));
      }

      const { id } = await res.json() as { id: string };
      localStorage.setItem(`csi:${id}`, JSON.stringify({ answers }));

      await fetch(`/api/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (parseError) setStatus(parseError);
      window.location.href = `/assess/${id}/review`;
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Import completed answers</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a previously exported JSON, CSV, or filled XLSX template to skip the form.
          </p>
        </div>
        <button
          onClick={handleTemplateDownload}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap ml-4"
        >
          Download blank template (.xlsx) ↓
        </button>
      </div>

      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) setFile(f);
        }}
      >
        {file ? (
          <p className="text-sm text-gray-700">{file.name}</p>
        ) : (
          <p className="text-sm text-gray-400">Click to select file, or drag & drop · XLSX, JSON, or CSV</p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.json,.csv"
        className="hidden"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
      {status && <p className="text-xs text-amber-600">{status}</p>}

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Importing…' : 'Import and review →'}
      </button>
    </div>
  );
}
