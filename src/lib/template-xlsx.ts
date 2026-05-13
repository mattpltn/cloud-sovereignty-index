import type ExcelJS from 'exceljs';
import type { CriteriaFile } from '../../shared/src/schema.js';
import { resolvePlaceholders } from '../../shared/src/tier-resolution.js';

interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }
interface CountriesFile { EU: Country[]; EEA_non_EU: Country[]; non_EU: Country[] }

// Evidence expected per question_id — same text for both EU and Global sheets
const EVIDENCE_EXPECTED: Record<string, string> = {
  'SOV-1-01': 'Commercial registry extract (e.g. Handelsregisterauszug, Kbis, Companies House, equivalent national registry) showing the legal entity providing the service. Master service agreement clause naming the governing law and forum for disputes. URL or PDF acceptable.',
  'SOV-1-02': 'Registered head office address from the commercial registry. For multi-entity providers, identify which legal entity contracts with customers and provides the assessed service. Discrepancy between contracting entity and parent group must be disclosed.',
  'SOV-1-03': 'Ownership structure diagram showing ultimate beneficial owners with their jurisdictions. Disclose any shareholder agreements, golden shares, board appointment rights, or veto rights held by entities outside the trusted jurisdiction. For listed companies, link to the most recent annual report ownership disclosure section.',
  'SOV-1-04': 'Contract clause text committing the provider to 90-day advance notice of changes affecting control (ownership, shareholding, governance, key personnel). Provide the exact clause number from the master service agreement.',
  'SOV-2-01': 'Most recent annual legal risk assessment identifying laws from third jurisdictions that could compel disclosure, restrict access, or suspend service. Must name the laws (e.g. US CLOUD Act, China Cybersecurity Law (CSL), UK Investigatory Powers Act, export control regimes), explain the basis for applicability to the provider, and describe mitigation measures. Date of last review required.',
  'SOV-2-02': 'Contract clause or formal procedure document granting the competent national cybersecurity authority audit rights against the C3A criteria. Specify notice period, cost-allocation rules, and confidentiality protections. Reference to existing C5 / SOC 2 Type II audits that the authority may accept in lieu of a bespoke audit.',
  'SOV-2-03': 'Documented procedure describing how the national administration can assume operational control of the service in a state of emergency or defense. Must include availability of source code, configuration data, administration credentials, and operational documentation in portable form. Reference the applicable national emergency regime (e.g. Verteidigungsfall, état d\'urgence, equivalent).',
  'SOV-3-01': 'Service documentation listing data centre locations for customer data, with the contractual SLA clause that binds these locations. Public URL to the service description AND the relevant DPA/contract clause. Identify any conditions under which data may be processed outside the named locations (support tickets, backup, disaster recovery).',
  'SOV-3-02': 'Customer-accessible tool, dashboard, or report that lets the customer verify in real time where their customer data, derived data, and account data are stored and processed. Screenshot or sample report acceptable. Identify how often the data is refreshed.',
  'SOV-3-03': 'Same evidence as SOV-3-01 but specifically for derived data (logs, telemetry, usage records) and account data (billing, contact, support metadata). Many providers store these in different regions than customer data — disclose the actual locations.',
  'SOV-3-04': 'Reference architecture document showing supported external KMS / HSM integrations: vendors, protocols (KMIP, PKCS#11), service tiers covered (IaaS / PaaS / SaaS). At least one named production customer reference using external keys for the assessed service. Disclose which services do NOT support external KMS.',
  'SOV-3-05': 'Reference architecture for external IdP integration: supported protocols (SAML 2.0, OIDC, SCIM), federation patterns, and whether the customer\'s IdP can authorise without account mirroring in the provider\'s directory. Disclose any administrative actions that bypass the external IdP (break-glass accounts, support-side access).',
  'SOV-3-06': 'Description of logging capability: log types (management plane, data plane), retention period, export formats, and customer access mechanism. Sample log record showing the schema. Confirm whether the provider can access these logs and whether customer access is independent of provider involvement.',
  'SOV-3-07': 'Reference architecture for client-side encryption: which services support it, the key custody model, and confirmation that the provider cannot access the plaintext under any operational scenario. Independent attestation (e.g. third-party security review, formal verification document) strongly preferred.',
  'SOV-4-01': 'Written policy on personnel jurisdiction for privileged-access roles: citizenship requirements, residency requirements, screening procedures, and frequency of re-screening. Reference to the relevant control in BSI C5, SOC 2, or ISO 27001 attestation describing personnel security. Identify any subcontractors with access and their personnel policies.',
  'SOV-4-02': 'Technical description of administrative access controls: network segmentation, bastion hosts, geo-fencing, MFA. Confirmation that administrative access from outside the trusted jurisdiction is blocked or requires explicit exception. Sample exception log or audit-trail screenshot acceptable.',
  'SOV-4-03': 'List of network connectivity providers used for the service, with their jurisdictions and ownership. Network diagram showing redundancy. At least one provider must be based in the trusted jurisdiction. Disclose any single-supplier dependencies (e.g. subsea cable consortium membership).',
  'SOV-4-04': 'SOC location(s), personnel jurisdiction, and operating model. Confirm that SOC functions can operate during a disconnect from extra-jurisdictional networks. If SOC is partially extra-territorial, document the stand-alone capability that activates during disconnect.',
  'SOV-4-05': 'Documented update and ingress process: secured network area description, vulnerability scanning approach, change management workflow. Confirm scanning sources used (EUVD, NIST CVE). Identify whether the secured area is on dedicated physical hardware.',
  'SOV-4-06': 'Documented risk-based security analysis procedure for third-party software, including detection methods for malicious code, viruses, spyware, ransomware. Reference relevant SOC 2 / C5 control. Identify whether the analysis covers all third-party software or only critical components.',
  'SOV-4-07': 'Documented process for monitoring, controlling, and logging data exchanges with third parties. Date of last annual review. Inventory of data exchanged with each third party. Format definitions for each exchange.',
  'SOV-4-08': 'Data flow diagram (DFD) covering all third-party data exchanges of customer, derived, and account data. Must identify origin, destination, protocol, data type, security mechanism. Confidential/NDA disclosure acceptable.',
  'SOV-4-09': 'Documented disconnect procedure (redacted version acceptable). Most recent disconnection test report including test date, scope, outcome, and any remediation actions. Test must be no older than 12 months. Untested capability is materially weaker than tested capability.',
  'SOV-4-10': 'Documented reconnect procedure including the update-replay process for environments disconnected up to 90 days. Most recent test report including outcome. Identify any updates that cannot be applied retroactively.',
  'SOV-5-01': 'Software Bill of Materials (SBOM) in CycloneDX or SPDX format, or equivalent, for each cloud service. Per C3A §2.5.1 the SBOM should meet BSI TR-03183-2 quality or comparable. Suppliers and their countries of origin must be identifiable. NDA-restricted access acceptable.',
  'SOV-5-02': 'Hardware bill of materials covering compute, storage, networking, and security appliances used to deliver the service. Suppliers and countries of manufacture (not just country of incorporation) identified. NDA-restricted access acceptable.',
  'SOV-5-03': 'List of external cloud services used to deliver the assessed service (e.g. third-party SaaS for monitoring, ticketing, identity). Provider name, jurisdiction of provision, jurisdiction of development. Identify which are critical-path.',
  'SOV-5-04': 'Documented process for identifying and mitigating export-control and supply-chain disruption risks. Most recent risk assessment date. Customer notification policy: under what trigger and timeframe.',
  'SOV-5-05': 'Documentation confirming capacity management is performed in the trusted jurisdiction per BSI C5 control. Relevant C5 attestation section reference (e.g. C5 OPS-04). Identify any capacity-management functions performed outside the trusted jurisdiction.',
  'SOV-6-01': 'Description of source code backup process: storage location, backup frequency (must be ≤ 24h per C3A), minimum versions retained (≥ 5 per C3A), and documentation enabling independent development. Independent attestation (audit firm letter, internal audit report) strongly preferred over self-statement.',
  'SOV-6-02': 'Documented contingency strategies for third-party software vendor disruption: alternative suppliers identified, internal remediation capability, or compensating controls. Specify which approach applies to which dependency.',
  'SOV-6-03': 'Description of internal software development capability: build environments, toolchains, key personnel with relevant skills. Contingency procedures for loss of access to development tools or third-party dependencies.',
  'SOV-7-01': 'Current ISO 27001 certificate (PDF) with explicit scope statement covering the assessed services, plus issue/expiry dates. Equivalent: SOC 2 Type II report (full report, not bridge letter), BSI C5 attestation. Surveillance audit dates required.',
  'SOV-7-02': 'Data Processing Agreement (DPA) referencing the applicable national data protection law. For EU: GDPR Article 28 compliant DPA. For other jurisdictions: equivalent national law (PDPA, PIPL, PDPB, etc.) DPA. Article 30 record of processing activities reference.',
  'SOV-7-03': 'Evidence of compliance with applicable mandatory cybersecurity regime: registration confirmation, incident reporting procedure, latest authority filing. For EU: NIS2 essential/important entity status and incident reporting workflow. For other jurisdictions: equivalent regime (Singapore CSA, US CIRCIA, etc.).',
  'SOV-7-04': 'If the customer is a regulated financial entity: ICT third-party risk register entry, contractual provisions covering DORA Article 30 requirements or equivalent. For non-financial customers: mark N/A.',
  'SOV-7-05': 'Customer-facing log access mechanism: API, console, or export channel. Sample log record schema. Confirmation that log access does not require provider-side involvement and that the log integrity is preserved (tamper-evident).',
  'SOV-7-06': 'Patch management procedure documenting which patches can be applied autonomously and which require third-party vendor involvement. Identify any patches that depend on extra-jurisdictional vendor cooperation. Most recent patch deployment timeline.',
  'SOV-7-07': 'Confirmation that the service and its sovereignty controls can be audited by an auditor based in the trusted jurisdiction without requiring cooperation from extra-jurisdictional entities. Identify the auditors who have actually performed such audits (named firms preferred).',
  'SOV-8-01': 'Published PUE (Power Usage Effectiveness) figures for the data centres used to deliver the service, with measurement methodology and reporting frequency. Target PUE commitment. Independent verification (e.g. CEEDA, ISO 50001) preferred over self-reporting.',
  'SOV-8-02': 'Documented renewable / low-carbon electricity sourcing for the data centres: percentage, energy attribute certificates (EACs, GoOs, RECs), power purchase agreement (PPA) references. Distinguish 24/7 matched supply from annual-net claims.',
  'SOV-8-03': 'Hardware end-of-life policy: secure data destruction procedure (e.g. NIST SP 800-88 reference), refurbishment / recycling partners, percentages refurbished vs disposed. Independent attestation preferred.',
  'SOV-8-04': 'Most recent annual sustainability report covering carbon emissions (Scope 1, 2, 3), water usage, energy consumption — scoped to the cloud service. CDP submission reference if applicable. URL acceptable.',
  'SOV-8-05': 'Published time-bound improvement targets for environmental sustainability metrics: target year, baseline year, magnitude. Most recent progress report. Distinguish science-based targets (e.g. SBTi-validated) from internal commitments.',
};

const EVIDENCE_TYPE_VALIDATION: ExcelJS.DataValidation = {
  type: 'list',
  allowBlank: true,
  formulae: ['"Audit report / certification,Contract clause,Public documentation,Provider statement,Verbal / none"'],
  showErrorMessage: false,
};

const ANSWER_VALIDATION = {
  type: 'list',
  allowBlank: true,
  formulae: ['"yes,no,partial,n/a"'],
  showErrorMessage: true,
  errorStyle: 'stop',
  errorTitle: 'Invalid answer',
  error: 'Please select: yes, no, partial, or n/a',
} as ExcelJS.DataValidation;

const HEADER_FILL = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' },
} as ExcelJS.Fill;
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
  country?: Country,
) {
  const ws = wb.addWorksheet(sheetName);

  // Columns: A–E locked, F locked (evidence_expected), G–H editable (CSP fills), I editable (answer)
  ws.columns = [
    { key: 'qid',       width: 14 },
    { key: 'tier',      width: 10 },
    { key: 'obj',       width: 14 },
    { key: 'title',     width: 32 },
    { key: 'text',      width: 64 },
    { key: 'ev_exp',    width: 60 },
    { key: 'ev_prov',   width: 50 },
    { key: 'ev_type',   width: 25 },
    { key: 'ans',       width: 12 },
  ];

  // Header row
  const header = ws.addRow([
    'question_id', 'tier', 'objective', 'question_title', 'question_text',
    'evidence_expected', 'evidence_provided', 'evidence_type', 'answer',
  ]);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.height = 18;
  header.eachCell(cell => { cell.alignment = { vertical: 'middle' }; });

  // Notes on CSP-filled columns
  header.getCell(7).note = { texts: [{ text: 'Fill in: document name, URL, contract clause reference, attestation ID, page number, or "none available".' }] };
  header.getCell(8).note = { texts: [{ text: 'Select the type of evidence provided.' }] };
  header.getCell(9).note = {
    texts: [
      { font: { bold: true }, text: 'Accepted values:\n' },
      { text: 'yes — fully compliant / implemented\n' },
      { text: 'no — not compliant / not implemented\n' },
      { text: 'partial — partially compliant (half points, not counted for sovereignty level)\n' },
      { text: 'n/a — not applicable (excluded from score entirely)\n' },
      { text: '\nLeave blank to skip a question.' },
    ],
  };

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const ctx = euMode
    ? { variant: 'EU-CSF' as const, country }
    : { variant: 'Generalized' as const, country };

  const blocBlocLabel = euMode ? 'EU' : 'your country';

  function applyDataRow(row: ExcelJS.Row, qid: string, text: string, fill: ExcelJS.Fill) {
    row.fill = fill;
    row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(6).value = EVIDENCE_EXPECTED[qid] ?? '';
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(8).dataValidation = EVIDENCE_TYPE_VALIDATION;
    row.getCell(9).dataValidation = ANSWER_VALIDATION;
    row.height = Math.min(60, Math.ceil(text.length / 80) * 15 + 15);
  }

  let objIndex = 0;
  for (const obj of criteria.objectives) {
    const fill = OBJ_FILLS[objIndex % 2];
    objIndex++;

    for (const q of obj.questions) {
      const displayTitle = (!euMode && q.title_generalized) ? q.title_generalized : q.title;
      if (q.type === 'single') {
        const rawText = (!euMode && q.text_generalized) ? q.text_generalized : q.text;
        const text = resolvePlaceholders(rawText, ctx);
        const row = ws.addRow([q.id, 'single', obj.id, displayTitle, text, '', '', '', '']);
        applyDataRow(row, q.id, text, fill);
      } else {
        const blocText = q.tiers.bloc.text.replace(/\{\{BLOC\}\}/g, blocBlocLabel);
        const resolvedBloc = resolvePlaceholders(blocText, ctx);
        const blocRow = ws.addRow([q.id, 'bloc', obj.id, displayTitle, resolvedBloc, '', '', '', '']);
        applyDataRow(blocRow, q.id, resolvedBloc, fill);

        if (euMode && q.tiers.national) {
          const natText = q.tiers.national.text;
          const natRow = ws.addRow([q.id, 'national', obj.id, displayTitle, natText, '', '', '', '']);
          applyDataRow(natRow, q.id, natText, fill);
        }
      }
    }
  }

  // Sheet protection: lock everything, then unlock CSP-filled columns (G, H, I = 7, 8, 9)
  ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
  });
  ws.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      row.getCell(7).protection = { locked: false };
      row.getCell(8).protection = { locked: false };
      row.getCell(9).protection = { locked: false };
    }
  });
}

export async function buildTemplateXlsx(
  criteria: CriteriaFile,
  countries: CountriesFile,
  selectedCountryCode?: string,
): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
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

  const selectedCountry = selectedCountryCode
    ? allCountries.find(c => c.code === selectedCountryCode)
    : undefined;

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
  addAssessmentSheet(wb, 'EU Assessment', criteria, true, selectedCountry);
  addAssessmentSheet(wb, 'Global Assessment', criteria, false, selectedCountry);

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
  const ExcelJS = (await import('exceljs')).default;
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

    // Detect column layout: new 9-col template has 'evidence_expected' in col 6 header
    const headerRow = ws.getRow(1);
    const col6Header = cellStr(headerRow.getCell(6)).toLowerCase();
    const answerCol = col6Header === 'evidence_expected' ? 9 : 6;

    let hasAnswers = false;
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const qid = cellStr(row.getCell(1));
      const tier = cellStr(row.getCell(2)) as 'bloc' | 'national' | 'single';
      const rawAns = cellStr(row.getCell(answerCol)).toLowerCase().trim();
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
