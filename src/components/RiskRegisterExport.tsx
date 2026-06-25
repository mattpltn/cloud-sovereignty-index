import { useState } from 'react';
import type { ActionOwner } from '../../shared/src/action-owner';

export interface RegisterRow {
  owner: ActionOwner;
  kind: 'clause' | 'gap';
  /** Infrastructure layer (clauses) or sovereignty domain (gaps). */
  group: string;
  objectiveId?: string;
  /** Clause id or question id. */
  id: string;
  title: string;
  /** CSL / contribution (0–4) or null. */
  severity: number | null;
  /** Full clause / question text — no truncation. */
  fullText: string;
  /** Source / basis citation. */
  basis: string;
  /** Expected evidence / what good looks like (gaps). */
  expected: string;
  /** The concrete recommended action. */
  action: string;
}

interface Props {
  rows: RegisterRow[];
  assessmentId: string;
  company?: string;
}

const OWNER_LABEL: Record<ActionOwner, string> = { supplier: 'Provider / contract', internal: 'Internal' };
const KIND_LABEL = { clause: 'Contract clause', gap: 'Control gap' } as const;

const HEADERS = [
  'Owner', 'Layer / Domain', 'Type', 'Reference', 'Title', 'Severity (CSL)',
  'Full detail', 'Basis / Source', 'Expected evidence', 'Recommended action',
];

function rowCells(r: RegisterRow): string[] {
  return [
    OWNER_LABEL[r.owner], r.group, KIND_LABEL[r.kind], r.id, r.title,
    r.severity != null ? String(r.severity) : '', r.fullText, r.basis, r.expected, r.action,
  ];
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(s: string): string {
  return `"${String(s ?? '').replace(/"/g, '""')}"`;
}

function buildCsv(rows: RegisterRow[]): string {
  const lines = [
    '# Cloud Sovereignty Index — Vendor & Internal Risk Register',
    '# "Provider / contract" rows = require from your supplier (clause to add or evidence to demand).',
    '# "Internal" rows = a control your own organisation must implement and document.',
    '#',
    HEADERS.join(','),
    ...rows.map(r => rowCells(r).map(csvCell).join(',')),
  ];
  return lines.join('\n');
}

export default function RiskRegisterExport({ rows, assessmentId, company }: Props) {
  const [status, setStatus] = useState('');
  if (rows.length === 0) return null;

  const supplier = rows.filter(r => r.owner === 'supplier');
  const internal = rows.filter(r => r.owner === 'internal');
  const base = `csi-risk-register-${assessmentId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}`;

  function done(fmt: string) {
    setStatus(`Downloaded ${fmt}`);
    setTimeout(() => setStatus(''), 2500);
  }

  function exportCsv() {
    downloadBlob(buildCsv(rows), `${base}.csv`, 'text/csv;charset=utf-8');
    done('CSV');
  }

  async function exportXlsx() {
    setStatus('Building XLSX…');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cloud Sovereignty Index';
    if (company) wb.title = `${company} — Sovereignty Risk Register`;

    const addSheet = (name: string, intro: string, data: RegisterRow[]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
      ws.mergeCells(1, 1, 1, HEADERS.length);
      ws.getCell(1, 1).value = intro;
      ws.getCell(1, 1).font = { italic: true, color: { argb: 'FF6B7280' }, size: 9 };
      ws.getRow(1).height = 22;
      ws.addRow([]);
      const head = ws.addRow(HEADERS);
      head.font = { bold: true };
      head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }; });
      for (const r of data) {
        const row = ws.addRow(rowCells(r));
        row.alignment = { vertical: 'top', wrapText: true };
      }
      ws.columns.forEach((col, i) => {
        col.width = [16, 22, 14, 16, 30, 10, 64, 30, 40, 48][i] ?? 20;
      });
    };

    addSheet('Provider & contract', 'Require these from your provider: add the clause to the contract / SLA, or demand the evidence. Negotiable templates.', supplier);
    addSheet('Internal actions', 'Controls your own organisation must implement and document (process, runbook, evidence).', internal);

    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(buf, `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    done('XLSX');
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-600">Risk register:</span>
      <button onClick={exportXlsx}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:border-gray-500 transition">
        XLSX ({supplier.length} provider · {internal.length} internal)
      </button>
      <button onClick={exportCsv}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:border-gray-500 transition">
        CSV
      </button>
      {status && <span className="text-xs text-green-600">{status}</span>}
    </div>
  );
}
