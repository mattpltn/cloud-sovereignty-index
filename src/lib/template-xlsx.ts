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
  criteria: CriteriaFile,
  variant: 'EU-CSF' | 'Generalized',
  country?: Country,
) {
  const ws = wb.addWorksheet('Assessment');

  // Columns: A=qid B=tier C=c3a_tier D=obj E=title F=text G=applies_to_eu_csf H=applies_to_c3a I=applies_to_csi J=ev_exp K=ev_prov L=ev_type M=ans
  ws.columns = [
    { key: 'qid',       width: 16 },  // A
    { key: 'tier',      width: 10 },  // B
    { key: 'c3a_tier',  width: 14 },  // C — hidden
    { key: 'obj',       width: 10 },  // D
    { key: 'title',     width: 30 },  // E
    { key: 'text',      width: 60 },  // F
    { key: 'eu_csf',    width: 10 },  // G — hidden
    { key: 'c3a',       width: 8  },  // H — hidden
    { key: 'csi',       width: 8  },  // I — hidden
    { key: 'ev_exp',    width: 60 },  // J
    { key: 'ev_prov',   width: 50 },  // K
    { key: 'ev_type',   width: 25 },  // L
    { key: 'ans',       width: 12 },  // M
  ];

  // Hide metadata columns
  ws.getColumn('C').hidden = true;
  ws.getColumn('G').hidden = true;
  ws.getColumn('H').hidden = true;
  ws.getColumn('I').hidden = true;

  const header = ws.addRow([
    'question_id', 'tier', 'c3a_tier', 'objective', 'question_title', 'question_text',
    'applies_to_eu_csf', 'applies_to_c3a', 'applies_to_csi_composite',
    'evidence_expected', 'evidence_provided', 'evidence_type', 'answer',
  ]);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.height = 18;
  header.eachCell(cell => { cell.alignment = { vertical: 'middle' }; });

  header.getCell(11).note = { texts: [{ text: 'Fill in: document name, URL, contract clause reference, attestation ID, page number, or "none available".' }] };
  header.getCell(12).note = { texts: [{ text: 'Select the type of evidence provided.' }] };
  header.getCell(13).note = {
    texts: [
      { font: { bold: true }, text: 'Accepted values:\n' },
      { text: 'yes — fully compliant / implemented\n' },
      { text: 'no — not compliant / not implemented\n' },
      { text: 'partial — partially compliant (EU-CSF / CSI: half points; C3A: counts as not-met)\n' },
      { text: 'n/a — not applicable (excluded from score entirely)\n' },
      { text: '\nLeave blank to skip a question.' },
    ],
  };

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const ctx = { variant, country };

  function applyDataRow(row: ExcelJS.Row, qid: string, text: string, fill: ExcelJS.Fill,
    c3aTier: string, applyEuCsf: boolean, applyC3a: boolean, applyCsi: boolean) {
    row.fill = fill;
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).value = c3aTier;
    row.getCell(7).value = applyEuCsf;
    row.getCell(8).value = applyC3a;
    row.getCell(9).value = applyCsi;
    row.getCell(10).value = EVIDENCE_EXPECTED[qid] ?? '';
    row.getCell(10).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(11).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(12).dataValidation = EVIDENCE_TYPE_VALIDATION;
    row.getCell(13).dataValidation = ANSWER_VALIDATION;
    row.height = Math.min(60, Math.ceil(text.length / 80) * 15 + 15);
  }

  let objIndex = 0;
  for (const obj of criteria.objectives) {
    const fill = OBJ_FILLS[objIndex % 2];
    objIndex++;

    for (const q of obj.questions) {
      const c3aTier = q.c3a_tier ?? 'not_applicable';
      const applyEuCsf = q.applies_to_eu_csf ?? false;
      const applyC3a = q.applies_to_c3a ?? false;
      const applyCsi = q.applies_to_csi_composite ?? false;

      if (q.type === 'single') {
        const text = resolvePlaceholders(q.text, ctx);
        const row = ws.addRow([q.id, 'single', c3aTier, obj.id, q.title, text, '', '', '', '', '', '', '']);
        applyDataRow(row, q.id, text, fill, c3aTier, applyEuCsf, applyC3a, applyCsi);
      } else {
        if (variant === 'Generalized') {
          // Non-EU: no supranational bloc — emit national tier only (or bloc if no national tier)
          const tierText = q.tiers.national
            ? resolvePlaceholders(q.tiers.national.text, ctx)
            : resolvePlaceholders(q.tiers.bloc.text, ctx);
          const tierKey = q.tiers.national ? 'national' : 'bloc';
          const row = ws.addRow([q.id, tierKey, c3aTier, obj.id, q.title, tierText, '', '', '', '', '', '', '']);
          applyDataRow(row, q.id, tierText, fill, c3aTier, applyEuCsf, applyC3a, applyCsi);
        } else {
          // EU-CSF: emit both bloc and national rows
          const blocText = resolvePlaceholders(q.tiers.bloc.text, ctx);
          const blocRow = ws.addRow([q.id, 'bloc', c3aTier, obj.id, q.title, blocText, '', '', '', '', '', '', '']);
          applyDataRow(blocRow, q.id, blocText, fill, c3aTier, applyEuCsf, applyC3a, applyCsi);

          if (q.tiers.national) {
            const natText = resolvePlaceholders(q.tiers.national.text, ctx);
            const natRow = ws.addRow([q.id, 'national', c3aTier, obj.id, q.title, natText, '', '', '', '', '', '', '']);
            applyDataRow(natRow, q.id, natText, fill, c3aTier, applyEuCsf, applyC3a, applyCsi);
          }
        }
      }
    }
  }

  // Grey out rows where none of the user's selected frameworks apply.
  // Formula is anchored on columns G/H/I (framework flags) and cross-references Setup toggles.
  // Applied as a "does not apply" rule: greys out when the row has no match.
  ws.addConditionalFormatting({
    ref: 'A2:M500',
    rules: [{
      type: 'expression',
      priority: 1,
      formulae: ['NOT(OR(AND(Setup!$C$7="yes",$G2),AND(Setup!$C$8="yes",$H2),AND(Setup!$C$9="yes",$I2)))'],
      style: {
        font: { color: { argb: 'FFB0B7C3' } },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF3F4F6' } },
      },
    }],
  });

  // Sheet protection: unlock CSP-filled columns K, L, M (11, 12, 13)
  ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
  });
  ws.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      row.getCell(11).protection = { locked: false };
      row.getCell(12).protection = { locked: false };
      row.getCell(13).protection = { locked: false };
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

  const euCodes = new Set([...countries.EU.map(c => c.code), ...countries.EEA_non_EU.map(c => c.code)]);
  const variant: 'EU-CSF' | 'Generalized' = selectedCountry && !euCodes.has(selectedCountry.code)
    ? 'Generalized'
    : 'EU-CSF';

  if (selectedCountry) setup.getCell('C5').value = `${selectedCountry.code} — ${selectedCountry.name}`;

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
  // Framework selection
  setup.getRow(7).height = 20;
  setup.getCell('B7').value = 'Include EU-CSF?';
  setup.getCell('B7').font = { bold: true };
  setup.getCell('C7').value = 'yes';
  setup.getCell('C7').fill = INPUT_FILL;
  setup.getCell('C7').dataValidation = { type: 'list', allowBlank: false, formulae: ['"yes,no"'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'yes or no' } as ExcelJS.DataValidation;

  setup.getRow(8).height = 20;
  setup.getCell('B8').value = 'Include C3A?';
  setup.getCell('B8').font = { bold: true };
  setup.getCell('C8').value = 'no';
  setup.getCell('C8').fill = INPUT_FILL;
  setup.getCell('C8').dataValidation = { type: 'list', allowBlank: false, formulae: ['"yes,no"'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'yes or no' } as ExcelJS.DataValidation;

  setup.getRow(9).height = 20;
  setup.getCell('B9').value = 'Include CSI Composite?';
  setup.getCell('B9').font = { bold: true };
  setup.getCell('C9').value = 'yes';
  setup.getCell('C9').fill = INPUT_FILL;
  setup.getCell('C9').dataValidation = { type: 'list', allowBlank: false, formulae: ['"yes,no"'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'yes or no' } as ExcelJS.DataValidation;

  setup.getRow(11).height = 16;
  setup.mergeCells('B11:C11');
  const instrCell = setup.getCell('B11');
  instrCell.value = '→ Fill in the "Assessment" sheet. Rows greyed out = not required for your selected framework(s).';
  instrCell.font = { italic: true, color: { argb: 'FF1D4ED8' } };

  setup.getRow(12).height = 16;
  setup.mergeCells('B12:C12');
  setup.getCell('B12').value = 'Once filled in, save this file and upload it at: cloudsovereigntyindex.org/assess/setup';
  setup.getCell('B12').font = { color: { argb: 'FF6B7280' } };

  // Hidden row — stores variant so parseXlsx can read it back without re-deriving from country codes
  setup.getRow(13).hidden = true;
  setup.getCell('B13').value = 'variant';
  setup.getCell('C13').value = variant;

  // ── Sheet 2: Assessment questions (single merged sheet) ─────────────────────
  addAssessmentSheet(wb, criteria, variant, selectedCountry);

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
  selected_frameworks?: string[];
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
  const selected_frameworks: string[] = [];

  // Read Setup sheet
  const setupSheet = wb.getWorksheet('Setup');
  if (setupSheet) {
    company_name = cellStr(setupSheet.getCell('C3')) || undefined;
    const countryVal = cellStr(setupSheet.getCell('C5'));
    if (countryVal) {
      const match = countryVal.match(/^([A-Z]{2})\s*[—-]/);
      country_code = match ? match[1] : countryVal.trim().toUpperCase();
    }
    // Framework selection (v2.0 template: C7 = eu_csf, C8 = c3a, C9 = csi_composite)
    if (cellStr(setupSheet.getCell('C7')).toLowerCase() === 'yes') selected_frameworks.push('eu_csf');
    if (cellStr(setupSheet.getCell('C8')).toLowerCase() === 'yes') selected_frameworks.push('c3a');
    if (cellStr(setupSheet.getCell('C9')).toLowerCase() === 'yes') selected_frameworks.push('csi_composite');
    // Variant stored in hidden row 13 (v2.1+ templates)
    const variantCell = cellStr(setupSheet.getCell('C13')).trim();
    if (variantCell === 'EU-CSF' || variantCell === 'Generalized') variant = variantCell;
  }

  // Read the merged Assessment sheet (v2.0) or legacy EU/Global sheets (v1.x)
  const assessmentSheet = wb.getWorksheet('Assessment');
  const legacySheets: Array<{ name: string; isEU: boolean }> = [
    { name: 'EU Assessment', isEU: true },
    { name: 'Global Assessment', isEU: false },
  ];

  // For v2.1+ templates variant is already set from Setup!C13; for legacy sheets derive from sheet name
  const sheetsToRead = assessmentSheet
    ? [{ ws: assessmentSheet, isEU: variant !== 'Generalized' }]
    : legacySheets.map(s => ({ ws: wb.getWorksheet(s.name), isEU: s.isEU })).filter(s => !!s.ws);

  for (const { ws, isEU } of sheetsToRead) {
    if (!ws) continue;

    // Detect column layout: v2.0 has 13 columns (answer in col 13), v1.x had 9 or 6
    const headerRow = ws.getRow(1);
    const col1Header = cellStr(headerRow.getCell(1)).toLowerCase();
    if (col1Header !== 'question_id') continue;
    const col6Header = cellStr(headerRow.getCell(6)).toLowerCase();
    const col13Header = cellStr(headerRow.getCell(13)).toLowerCase();
    let answerCol: number;
    if (col13Header === 'answer') answerCol = 13;           // v2.0
    else if (col6Header === 'evidence_expected') answerCol = 9; // v1.x 9-col
    else answerCol = 6;                                     // v1.x 6-col

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

  return {
    answers,
    company_name,
    country_code,
    variant,
    selected_frameworks: selected_frameworks.length > 0 ? selected_frameworks : undefined,
  };
}
