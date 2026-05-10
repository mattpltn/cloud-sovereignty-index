import ExcelJS from 'exceljs';
import type { CriteriaFile } from '../../shared/src/schema.js';
import { resolvePlaceholders } from '../../shared/src/tier-resolution.js';

interface Country { code: string; name: string }
interface CountriesFile { EU: Country[]; EEA_non_EU: Country[]; non_EU: Country[] }

const ANSWER_VALIDATION: ExcelJS.DataValidation = {
  type: 'list',
  allowBlank: true,
  formulae: ['"yes,no,partial,n/a"'],
  showErrorMessage: true,
  errorStyle: 'stop',
  errorTitle: 'Invalid answer',
  error: 'Please select: yes, no, partial, or n/a',
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' },
};
const INPUT_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' },
};
const OBJ_FILLS: ExcelJS.Fill[] = [
  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } },
];

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text).trim();
  if (typeof v === 'object' && 'richText' in v) {
    return (v as { richText: Array<{ text: string }> }).richText.map(r => r.text).join('').trim();
  }
  return '';
}

function addAssessmentSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  criteria: CriteriaFile,
  euMode: boolean,
) {
  const ws = wb.addWorksheet(sheetName);

  ws.columns = [
    { key: 'qid',   width: 14 },
    { key: 'tier',  width: 10 },
    { key: 'obj',   width: 14 },
    { key: 'title', width: 32 },
    { key: 'text',  width: 64 },
    { key: 'ans',   width: 12 },
  ];

  // Header row
  const header = ws.addRow(['question_id', 'tier', 'objective', 'question_title', 'question_text', 'answer']);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.height = 18;
  // Note on the answer header cell
  const ansHeader = header.getCell(6);
  ansHeader.note = {
    texts: [{ font: { bold: true }, text: 'Accepted values:\n' },
      { text: 'yes — fully compliant / implemented\n' },
      { text: 'no — not compliant / not implemented\n' },
      { text: 'partial — partially compliant (half points, not counted for SEAL level)\n' },
      { text: 'n/a — not applicable (excluded from score entirely)\n' },
      { text: '\nLeave blank to skip a question.' }],
  };

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const euCtx = { variant: 'EU-CSF' as const };
  const globalCtx = { variant: 'Generalized' as const };
  const ctx = euMode ? euCtx : globalCtx;

  // For non-EU mode, resolve bloc text with generic placeholder
  const blocBlocLabel = euMode ? 'EU' : 'your country';

  let objIndex = 0;
  for (const obj of criteria.objectives) {
    const fill = OBJ_FILLS[objIndex % 2];
    objIndex++;

    for (const q of obj.questions) {
      if (q.type === 'single') {
        const text = resolvePlaceholders(q.text, ctx);
        const row = ws.addRow([q.id, 'single', obj.id, q.title, text, '']);
        row.fill = fill;
        row.getCell(6).dataValidation = ANSWER_VALIDATION;
        row.height = Math.min(60, Math.ceil(text.length / 80) * 15 + 15);
        row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
      } else {
        // bloc row
        const blocText = q.tiers.bloc.text.replace(/\{\{BLOC\}\}/g, blocBlocLabel);
        const resolvedBloc = resolvePlaceholders(blocText, ctx);
        const blocRow = ws.addRow([q.id, 'bloc', obj.id, q.title, resolvedBloc, '']);
        blocRow.fill = fill;
        blocRow.getCell(6).dataValidation = ANSWER_VALIDATION;
        blocRow.height = Math.min(60, Math.ceil(resolvedBloc.length / 80) * 15 + 15);
        blocRow.getCell(5).alignment = { wrapText: true, vertical: 'top' };

        // national row (EU mode only, with note about placeholders)
        if (euMode && q.tiers.national) {
          const natText = q.tiers.national.text; // keep placeholders intact
          const natRow = ws.addRow([q.id, 'national', obj.id, q.title, natText, '']);
          natRow.fill = fill;
          natRow.getCell(6).dataValidation = ANSWER_VALIDATION;
          natRow.height = Math.min(60, Math.ceil(natText.length / 80) * 15 + 15);
          natRow.getCell(5).alignment = { wrapText: true, vertical: 'top' };
          // Note explaining placeholders
          natRow.getCell(5).note = {
            texts: [
              { font: { bold: true }, text: 'Country-specific question\n' },
              { text: 'Replace placeholders before use:\n' },
              { text: '{{COUNTRY}} → your member state (e.g. France)\n' },
              { text: '{{COUNTRY_ADJ}} → adjective (e.g. French)\n' },
              { text: '{{NATIONAL_ADMIN}} → your national admin body\n' },
              { text: '{{EMERGENCY_REGIME}} → your legal emergency regime\n' },
              { text: '\nThis row only applies when assessing against a specific EU member state.' },
            ],
          };
        }
      }
    }
  }

  // Lock all columns except answer (column F = col 6)
  ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
  });
  // Unlock answer cells (column 6, rows 2+)
  ws.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      row.getCell(6).protection = { locked: false };
    }
  });
}

export async function buildTemplateXlsx(
  criteria: CriteriaFile,
  countries: CountriesFile,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cloud Sovereignty Index';
  wb.created = new Date();

  // ── Sheet 1: Setup ─────────────────────────────────────────────────────────
  const setup = wb.addWorksheet('Setup');
  setup.columns = [
    { width: 4 },   // A — spacer
    { width: 32 },  // B — label
    { width: 44 },  // C — input
  ];

  // Title
  setup.mergeCells('B1:C1');
  const titleCell = setup.getCell('B1');
  titleCell.value = 'Cloud Sovereignty Index — Assessment Template';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: 'middle' };
  setup.getRow(1).height = 28;

  // Company name
  setup.getRow(3).height = 20;
  setup.getCell('B3').value = 'Company name (optional)';
  setup.getCell('B3').font = { bold: true };
  setup.getCell('C3').fill = INPUT_FILL;
  setup.getCell('C3').border = { bottom: { style: 'thin', color: { argb: 'FFCA8A04' } } };
  setup.getCell('C3').note = { texts: [{ text: 'Enter your organisation name. This is optional and stored only in your assessment record.' }] };

  // Country
  setup.getRow(5).height = 20;
  setup.getCell('B5').value = 'Country';
  setup.getCell('B5').font = { bold: true };
  setup.getCell('C5').fill = INPUT_FILL;
  setup.getCell('C5').border = { bottom: { style: 'thin', color: { argb: 'FFCA8A04' } } };

  // Build sorted country list
  const allCountries: Country[] = [
    ...countries.EU,
    ...countries.EEA_non_EU,
    ...countries.non_EU,
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Write country list to a hidden helper column (Z) for data validation
  // ExcelJS list validation from a range is more reliable than a giant inline string
  const hiddenSheet = wb.addWorksheet('__countries__');
  hiddenSheet.state = 'veryHidden';
  allCountries.forEach((c, i) => {
    hiddenSheet.getCell(i + 1, 1).value = `${c.code} — ${c.name}`;
  });
  const lastRow = allCountries.length;

  setup.getCell('C5').dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`__countries__!$A$1:$A$${lastRow}`],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Unknown country',
    error: 'Please select a country from the dropdown list.',
  };

  // Instructions
  setup.getRow(7).height = 18;
  setup.mergeCells('B7:C7');
  const instrCell = setup.getCell('B7');
  instrCell.value = '→ EU / EEA countries: fill in the "EU Assessment" sheet.';
  instrCell.font = { italic: true, color: { argb: 'FF1D4ED8' } };

  setup.getRow(8).height = 18;
  setup.mergeCells('B8:C8');
  const instrCell2 = setup.getCell('B8');
  instrCell2.value = '→ All other countries: fill in the "Global Assessment" sheet.';
  instrCell2.font = { italic: true, color: { argb: 'FF1D4ED8' } };

  setup.getRow(10).height = 16;
  setup.mergeCells('B10:C10');
  setup.getCell('B10').value = 'Once filled in, save this file and upload it at: cloudsovereigntyindex.org/assess/setup';
  setup.getCell('B10').font = { color: { argb: 'FF6B7280' } };

  // ── Sheets 2 & 3: Assessment questions ─────────────────────────────────────
  addAssessmentSheet(wb, 'EU Assessment', criteria, true);
  addAssessmentSheet(wb, 'Global Assessment', criteria, false);

  // ── Sheet 4: Privacy ───────────────────────────────────────────────────────
  const privacy = wb.addWorksheet('Privacy');
  privacy.columns = [{ width: 4 }, { width: 90 }];

  const privacyLines = [
    ['PRIVACY NOTICE', true, 14],
    ['', false, 12],
    ['Your assessment is stored on Cloudflare D1 under a cryptographically-random ID.', false, 11],
    ['Anyone with the URL can read or modify the assessment — that is the access control.', false, 11],
    ['', false, 11],
    ['What we store', true, 11],
    ['• Your answers (stored under a random ID, accessible only via URL)', false, 11],
    ['• Company name, if you voluntarily provide it', false, 11],
    ['• Assessment metadata: variant, country, service models, role', false, 11],
    ['', false, 11],
    ['What we never collect', true, 11],
    ['• Email addresses', false, 11],
    ['• IP addresses', false, 11],
    ['• Browser fingerprints or cookies', false, 11],
    ['• Any identifying information beyond what you explicitly type', false, 11],
    ['', false, 11],
    ['Data retention', true, 11],
    ['Assessments inactive for 12 months are permanently deleted.', false, 11],
    ['', false, 11],
    ['Open source', true, 11],
    ['The Cloud Sovereignty Index source code, including the persistence Workers, is public.', false, 11],
    ['You can audit our privacy claims at any time.', false, 11],
  ] as [string, boolean, number][];

  privacyLines.forEach(([text, bold, size]) => {
    const row = privacy.addRow(['', text]);
    row.getCell(2).font = { bold, size };
    row.getCell(2).alignment = { wrapText: true };
    if (!text) row.height = 8;
  });

  // ── Serialize ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Parser: read answers back from an uploaded XLSX ─────────────────────────

export interface ParsedXlsx {
  answers: Record<string, { tier: string; value: string }>;
  company_name?: string;
  country_code?: string;
  variant?: 'EU-CSF' | 'Generalized';
}

const VALID_ANSWERS = new Set(['yes', 'no', 'partial', 'n/a']);

export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedXlsx> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const answers: Record<string, { tier: string; value: string }> = {};
  let company_name: string | undefined;
  let country_code: string | undefined;
  let variant: 'EU-CSF' | 'Generalized' | undefined;

  // Read Setup sheet
  const setupSheet = wb.getWorksheet('Setup');
  if (setupSheet) {
    company_name = cellStr(setupSheet.getCell('C3')) || undefined;
    const countryVal = cellStr(setupSheet.getCell('C5'));
    if (countryVal) {
      // Format is "FR — France" or just a code
      const match = countryVal.match(/^([A-Z]{2})\s*[—-]/);
      country_code = match ? match[1] : countryVal.trim().toUpperCase();
    }
  }

  // Read both assessment sheets
  const sheetDefs: Array<{ name: string; isEU: boolean }> = [
    { name: 'EU Assessment', isEU: true },
    { name: 'Global Assessment', isEU: false },
  ];

  for (const { name, isEU } of sheetDefs) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;

    let hasAnswers = false;
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // header
      const qid = cellStr(row.getCell(1));
      const tier = cellStr(row.getCell(2)) as 'bloc' | 'national' | 'single';
      const rawAns = cellStr(row.getCell(6)).toLowerCase().trim();
      if (!qid || !VALID_ANSWERS.has(rawAns)) return;

      const key = tier === 'single' ? qid : `${qid}:${tier}`;
      answers[key] = { tier, value: rawAns };
      hasAnswers = true;
    });

    if (hasAnswers && !variant) {
      variant = isEU ? 'EU-CSF' : 'Generalized';
    }
  }

  return { answers, company_name, country_code, variant };
}
