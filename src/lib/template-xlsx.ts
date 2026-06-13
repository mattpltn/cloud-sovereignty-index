import type ExcelJS from 'exceljs';
import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import { buildProvenance } from '../../shared/src/provenance.js';
import { buildSheetRefs, toExcelFormula } from '../../shared/src/relevance.js';
import sourceRegisterData from '../../data/source-register.json';
import riskRegisterData from '../../data/risk-register.json';

type FrameworkMode = 'eu_csf' | 'c3a' | 'cada' | 'lmic' | 'csi_composite';

function questionPrimaryMode(q: Question): FrameworkMode {
  if (q.applies_to_eu_csf) return 'eu_csf';
  if (q.applies_to_c3a) return 'c3a';
  if (q.applies_to_cada) return 'cada';
  if (q.applies_to_lmic) return 'lmic';
  return 'csi_composite';
}

// Questions that appear in the risk register, keyed by question_id
const QUESTION_RISK_MAP: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const risk of riskRegisterData.risks) {
    for (const qid of risk.question_ids) {
      if (!m.has(qid)) m.set(qid, []);
      m.get(qid)!.push(risk.id);
    }
  }
  return m;
})();

interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }
interface CountriesFile { EU: Country[]; EEA_non_EU: Country[]; non_EU: Country[] }

// EU + EEA country codes — used in both the __eu_codes__ hidden sheet and the parseXlsx fallback
const EU_EEA_CODES = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE', // EU27
  'IS','LI','NO', // EEA non-EU
];

// Evidence expected per question_id — same text for both EU and Global sheets
const EVIDENCE_EXPECTED: Record<string, string> = {
  'SOV-1-01': 'Commercial registry extract (e.g. Handelsregisterauszug, Kbis, Companies House, equivalent national registry) showing the legal entity providing the service. Master service agreement clause naming the governing law and forum for disputes. URL or PDF acceptable.',
  'SOV-1-02': 'Registered head office address from the commercial registry. For multi-entity providers, identify which legal entity contracts with customers and provides the assessed service. Discrepancy between contracting entity and parent group must be disclosed.',
  'SOV-1-03': 'Ownership structure diagram showing ultimate beneficial owners with their jurisdictions. Disclose any shareholder agreements, golden shares, board appointment rights, or veto rights held by entities outside the trusted jurisdiction. For listed companies, link to the most recent annual report ownership disclosure section.',
  'SOV-1-04': 'Contract clause text committing the provider to 90-day advance notice of changes affecting control (ownership, shareholding, governance, key personnel). Provide the exact clause number from the master service agreement.',
  'SOV-1-05': 'Cap table or investor register showing top shareholders with their jurisdiction of incorporation and tax residency. For listed companies: link to annual report ownership section disclosing EU vs. non-EU share capital. Evidence of EU investment activity: infrastructure spend in EU, EU-based headcount, EU public funding received (EIB/EIF, structural funds, Horizon Europe). A non-EU majority ownership base is not automatically disqualifying but must be disclosed.',
  'SOV-1-06': 'Documentary evidence of active participation in one or more EU-level sovereignty initiatives — e.g. Gaia-X membership certificate, EUCS certification document, IPCEI-CIS participation letter, EU Sovereign Cloud Label. Self-declaration of alignment is not sufficient; formal membership with a verifiable artefact is required. For non-EU assessments: national cloud sovereignty certification or formal participation in government digital strategy programmes.',
  'SOV-1-07': 'Legal opinion from EU-qualified counsel addressing the provider\'s obligations under competing jurisdictions (US CLOUD Act, FISA, Chinese Cybersecurity Law, etc.) and confirming no extant order or obligation to suspend service. Operational runbook covering continuity of service if a key upstream vendor withdraws support — must name the top-3 dependencies. Date and summary of most recent contingency drill (within 12 months). Any contractual protections against unilateral suspension by upstream vendors.',
  'SOV-2-01': 'Most recent annual legal risk assessment identifying laws from third jurisdictions that could compel disclosure, restrict access, or suspend service. Must name the laws (e.g. US CLOUD Act, China Cybersecurity Law (CSL), UK Investigatory Powers Act, export control regimes), explain the basis for applicability to the provider, and describe mitigation measures. Date of last review required.',
  'SOV-2-02': 'Contract clause or formal procedure document granting the competent national cybersecurity authority audit rights against the C3A criteria. Specify notice period, cost-allocation rules, and confidentiality protections. Reference to existing C5 / SOC 2 Type II audits that the authority may accept in lieu of a bespoke audit.',
  'SOV-2-03': 'Documented procedure describing how the national administration can assume operational control of the service in a state of emergency or defense. Must include availability of source code, configuration data, administration credentials, and operational documentation in portable form. Reference the applicable national emergency regime (e.g. Verteidigungsfall, état d\'urgence, equivalent).',
  'SOV-2-04': 'IP ownership register or legal counsel statement identifying: the legal entity holding the core platform IP, its jurisdiction of incorporation, the relevant IP registry (EPO, EUIPO, national patent office). Confirm no encumbrances, licensing-back arrangements, or foreign patent claims that could restrict customer access to or use of the service. For multi-entity providers: identify whether IP is held at subsidiary level and the access implications if that subsidiary changes ownership. Core platform IP only — third-party libraries excluded.',
  'SOV-3-01': 'Service documentation listing data centre locations for customer data, with the contractual SLA clause that binds these locations. Public URL to the service description AND the relevant DPA/contract clause. Identify any conditions under which data may be processed outside the named locations (support tickets, backup, disaster recovery).',
  'SOV-3-01-C1': 'Customer-accessible tool, dashboard, or report that lets the customer verify in real time where their customer data, derived data, and account data are stored and processed. Screenshot or sample report acceptable. Identify how often the data is refreshed.',
  'SOV-3-01-C2': 'Same evidence as SOV-3-01 but specifically for derived data (logs, telemetry, usage records) and account data (billing, contact, support metadata). Many providers store these in different regions than customer data — disclose the actual locations.',
  'SOV-3-01-C5': 'Service documentation listing data centre locations used to store cloud service provider data (configuration, system telemetry, resource allocation logs). Many providers process provider data in different regions than customer data — disclose actual locations. Contractual SLA clause binding these locations.',
  'SOV-3-02-C': 'Reference architecture document showing supported external KMS / HSM integrations: vendors, protocols (KMIP, PKCS#11), service tiers covered (IaaS / PaaS / SaaS). At least one named production customer reference using external keys for the assessed service. Disclose which services do NOT support external KMS.',
  'SOV-3-03-C': 'Reference architecture for external IdP integration: supported protocols (SAML 2.0, OIDC, SCIM), federation patterns, and whether the customer\'s IdP can authorise without account mirroring in the provider\'s directory. Disclose any administrative actions that bypass the external IdP (break-glass accounts, support-side access).',
  'SOV-3-04-C': 'Description of logging capability: log types (management plane, data plane), retention period, export formats, and customer access mechanism. Sample log record showing the schema. Confirm whether the provider can access these logs and whether customer access is independent of provider involvement.',
  'SOV-3-05-C': 'Reference architecture for client-side encryption: which services support it, the key custody model, and confirmation that the provider cannot access the plaintext under any operational scenario. Independent attestation (e.g. third-party security review, formal verification document) strongly preferred.',
  'SOV-3-06': 'Documented data erasure procedure specifying: (1) data categories covered (customer data, derived data, account data); (2) storage locations included (primary, backups, disaster-recovery, CDN caches, log pipelines, analytics stores); (3) erasure method (cryptographic erasure, NIST SP 800-88-compliant media sanitisation, or equivalent); (4) timeline from request to completion and confirmation of completion. Verifiable evidence: cryptographic deletion certificate, audited deletion log with hash confirmation, or independent third-party attestation. SLA clause stating the deletion timeline.',
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
  'SOV-6-04': 'Inventory of processors and accelerators used for compute-intensive workloads: processor family, accelerator model, semiconductor vendor, vendor jurisdiction of incorporation, sourcing country. Identify whether any single accelerator family exceeds 75% of deployed HPC capacity. Evidence of supply chain diversification: alternative sourcing agreements, multi-vendor procurement policy, or contractual protections against single-vendor withdrawal. Export control status: confirm hardware is obtainable under standard commercial terms without EAR/EU dual-use export licence restrictions.',
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

  // Additional Criteria (AC) and Fallback (FB) questions
  'SOV-3-02-AC': 'List of SaaS services in scope; for each: confirmation of external KMS support, supported protocols (KMIP, PKCS#11, REST/JWK), and tested HSM/KMS vendors. Where only a subset of SaaS supports external KMS, provide that list explicitly per the criterion text. Customer reference or integration test result preferred over self-declaration.',
  'SOV-3-03-AC1': 'Technical documentation confirming external IdP integration uses open, non-proprietary standards: SAML 2.0, OIDC/OAuth2, SCIM. Confirm no proprietary extension is required for core authentication flows. Link to public documentation or integration guide.',
  'SOV-3-03-AC2': 'Architecture documentation or technical specification confirming stateless authentication: no shadow account or directory mirror is created in the provider\'s directory when a customer uses their own IdP. Identify any administrative actions that require provider-side accounts (break-glass, support access) and document their scope.',
  'SOV-3-03-AC3': 'Technical documentation showing support for claim-based and attribute-based access control driven by the customer\'s IdP (e.g. ABAC via JWT/SAML attributes). Examples of supported claim types and how they map to access decisions. API reference or integration guide.',
  'SOV-3-04-AC1': 'Logging API documentation: endpoint reference, supported protocols (REST, gRPC, OpenSearch, etc.), real-time delivery latency guarantee, and confirmation that the API uses open or open-source protocols. Sample API call, SDK code example, or Postman collection preferred.',
  'SOV-3-04-AC2': 'Documentation of log filtering capabilities: supported filter parameters (time range, resource type, event type, severity, user identity, correlation ID), applying to both management-plane and data-plane logs. API reference section or dashboard screenshot demonstrating filter configuration.',
  'SOV-4-01-C3': 'Commercial registry documentation confirming the entity providing operating personnel is a standalone European legal entity with no non-EU controlling shareholder or parent. Ownership structure showing ultimate beneficial owners and jurisdictions. Board composition and governance charter confirming independence from non-EU direction.',
  'SOV-4-01-FB': 'Written policy confirming all privileged-access personnel are residents of the assessed country. Evidence of national security clearance (or equivalent national vetting scheme) applied to those roles, including re-screening frequency. Contract clauses or employee agreements binding personnel to confidentiality under applicable national law.',
  'SOV-4-03-AC': 'Corporate ownership documentation for at least one connectivity provider demonstrating it is not owned by or affiliated with the cloud service provider. Commercial registry extract or company structure diagram. Network redundancy architecture diagram showing the independent provider.',
  'SOV-4-05-AC1': 'Architecture documentation confirming the secure network area (DMZ / ingress control zone) is implemented on dedicated physical devices, not virtualised shared infrastructure. Data centre audit report section or formal attestation from a qualified auditor covering network segmentation. NDA-restricted disclosure acceptable.',
  'SOV-4-05-AC2': 'Existence of a documented authority disclosure procedure: procedure document (redacted acceptable), identification of the responsible cybersecurity authority for the data centre location, and the secure submission mechanism. Prior disclosure events or test-disclosure exercise records are acceptable supporting evidence.',
  'SOV-4-08-AC': 'Confirmation that the DFD required under SOV-4-08 can be submitted to the responsible cybersecurity authority on request. Authority disclosure procedure documentation, identification of the responsible authority, and secure disclosure mechanism. Evidence of any prior formal or test disclosure preferred.',
  'SOV-4-09-AC': 'Confirmation that the disconnect process documentation and test reports required under SOV-4-09 can be provided to the responsible cybersecurity authority on request. Authority disclosure procedure, identification of the responsible authority, and secure disclosure mechanism. Prior formal or test disclosure record preferred.',
  'SOV-4-09-FB': 'Documented disconnect and reconnect procedure (redacted acceptable). Evidence of at least one tabletop exercise in the past 12 months: date, scope, participants, and outcome summary. A facilitated tabletop with written sign-off is sufficient — a live operational disconnect test is not required for this fallback.',
  'SOV-5-01-AC': 'Software dependency risk management process document: methodology for identifying critical dependencies, risk scoring, and mitigation strategies (dual-source, internal fork, open-source fallback). For critical dependencies where substitution is not feasible: the disclosure provided to customers. Date of most recent risk assessment.',
  'SOV-5-02-AC': 'Hardware dependency risk management process document: methodology for identifying critical hardware dependencies, risk scoring, and mitigation strategies (multi-vendor sourcing, strategic inventory, architectural substitution). For critical dependencies where substitution is not feasible: the disclosure provided to customers. Date of most recent risk assessment.',
  'SOV-5-03-AC': 'External service dependency management process document: inventory of external services (name, provider, jurisdiction), criticality classification, and mitigation strategies. For dependencies where substitution is not feasible: the disclosure provided to customers. Date of most recent review.',
  'SOV-6-02-AC': 'Description of internal engineering capability to maintain and patch the platform without third-party vendor involvement: team composition and skills, internal build environments, toolchain independence. Evidence of at least one instance of independent vulnerability remediation or emergency patch deployment (incident report, internal audit extract, or attestation). Independent third-party attestation preferred.',

  // v2.1 additions
  'SOV-2-03-CSI': 'Documented takeover-readiness procedure. Inventory of portable artefacts (source code escrow with national-jurisdiction trustee, exported admin tools, redacted runbooks). Evidence of at least one tabletop exercise. Contractual clause obligating the provider to cooperate under declared national emergency.',
  'SOV-3-AI-01-AC': 'Documented training data provenance for each AI/ML model integrated into the cloud service. Disclosure of jurisdictions, dataset origins, and any contractual terms with upstream model providers. Independent third-party attestation where feasible.',
  'SOV-3-AI-02-AC': 'Inference architecture documentation showing the model serving endpoints and their geographic locations. Contractual clause guaranteeing no fallback to non-{{BLOC}} inference regions during peak load or regional outage. Logs demonstrating no cross-border inference traffic.',
  'SOV-3-AI-03-AC': 'Contractual clause confirming customer data is not used for model training without explicit opt-in. Technical control documentation (e.g. data isolation, no-train flags propagated through the inference pipeline). Audit log capability allowing the customer to verify no training-data extraction occurred.',
  'SOV-3-AI-04-AC': 'Inventory of all AI/ML models in the service, each with: model name, model provider name, jurisdiction of incorporation, parent/ultimate-beneficial-owner disclosure, model weight hosting location, and model update/governance regime. Equivalent to a Software Bill of Materials but for models (an AI-BOM).',
  'SOV-4-03-FB': 'Network architecture diagram showing BGP peering with at least two distinct upstream ASNs. Evidence of recent failover test (within 12 months): date, scope, outcome, RPO/RTO observed. Where only one carrier is commercially available, evidence of physically diverse paths to that carrier (separate fibre routes, separate cable landings).',
  'SOV-6-01-FB1': 'Description of the local build environment: hosts, toolchains, registry mirrors, CI pipelines. Evidence of a recent build performed entirely in country (within 12 months). Headcount and skills inventory of in-country engineering staff with the capability to maintain the build pipeline. Documented contingency procedure covering loss of access to the upstream source code repository.',
  'SOV-6-01-FB2': 'Documented exit and portability plan covering: data export format, export timeline, support obligations during exit, fees (if any), and post-exit data deletion certification. Evidence of at least one tested export performed within 12 months — exit drill report or customer-supplied attestation.',
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
  formulae: ['"yes,no,partial,planned,n/a"'],
  showErrorMessage: true,
  errorStyle: 'stop',
  errorTitle: 'Invalid answer',
  error: 'Please select: yes, no, partial, planned, or n/a',
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
  skipFrameworkGreying = false,
) {
  const ws = wb.addWorksheet('Assessment');

  // Columns: A=qid B=tier C=c3a_tier D=obj E=title F=text G=applies_to_eu_csf H=applies_to_c3a I=applies_to_csi J=ev_exp K=ev_prov L=ev_type M=ans N=guidance O=c3a_source_id P=eu_csf_source_factor Q=seal_contribution_eu_csf R=seal_contribution_csi
  ws.columns = [
    { key: 'qid',                    width: 16 },  // A
    { key: 'tier',                   width: 10 },  // B
    { key: 'c3a_tier',               width: 14 },  // C — hidden
    { key: 'obj',                    width: 10 },  // D
    { key: 'title',                  width: 30 },  // E
    { key: 'text',                   width: 60 },  // F
    { key: 'eu_csf',                 width: 10 },  // G — hidden
    { key: 'c3a',                    width: 8  },  // H — hidden
    { key: 'csi',                    width: 8  },  // I — hidden
    { key: 'ev_exp',                 width: 60 },  // J
    { key: 'ev_prov',                width: 50 },  // K
    { key: 'ev_type',                width: 25 },  // L
    { key: 'ans',                    width: 12 },  // M
    { key: 'guidance',               width: 60 },  // N — read-only contextual guidance
    { key: 'c3a_source_id',          width: 20 },  // O — auditor traceability
    { key: 'eu_csf_source_factor',   width: 40 },  // P
    { key: 'seal_contribution_eu_csf', width: 22 }, // Q
    { key: 'seal_contribution_csi',  width: 20 },  // R
    { key: 'prov_framework',         width: 40 },  // S — Source framework
    { key: 'prov_clause',            width: 40 },  // T — Source clause
    { key: 'prov_fidelity',          width: 16 },  // U — Fidelity
    { key: 'prov_basis',             width: 70 },  // V — Basis / rationale
    { key: 'prov_relevant',          width: 18 },  // W — Relevant? (scope formula)
    { key: 'prov_risks',             width: 30 },  // X — Risk(s) addressed
  ];

  // Hide metadata columns
  ws.getColumn('C').hidden = true;
  ws.getColumn('G').hidden = true;
  ws.getColumn('H').hidden = true;
  ws.getColumn('I').hidden = true;

  const header = ws.addRow([
    'question_id', 'tier', 'c3a_tier', 'objective', 'question_title', 'question_text',
    'applies_to_eu_csf', 'applies_to_c3a', 'applies_to_csi_composite',
    'evidence_expected', 'evidence_provided', 'evidence_type', 'answer', 'guidance',
    'c3a_source_id', 'eu_csf_source_factor', 'seal_contribution_eu_csf', 'seal_contribution_csi',
    'source_framework', 'source_clause', 'fidelity', 'basis', 'relevant', 'risks_addressed',
  ]);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.height = 18;
  header.eachCell(cell => { cell.alignment = { vertical: 'middle' }; });

  header.getCell(11).note = { texts: [
    { font: { bold: true }, text: 'Evidence reference:\n' },
    { text: 'Fill in: document name, URL, contract clause reference, attestation ID, or page number.\n\n' },
    { font: { bold: true }, text: 'For "planned" answers, evidence is mandatory:\n' },
    { text: 'Acceptable evidence: board-approved roadmap document with named milestone and target date; signed project plan; approved budget line; vendor contract with delivery date; or a formal programme record traceable to a decision-making authority.\n' },
    { text: '"Planned" without a verifiable artefact will be treated as No during any external review.' },
  ] };
  header.getCell(12).note = { texts: [{ text: 'Select the type of evidence provided.' }] };
  header.getCell(13).note = {
    texts: [
      { font: { bold: true }, text: 'Accepted values:\n' },
      { text: 'yes — fully compliant / implemented\n' },
      { text: 'no — not compliant / not implemented\n' },
      { text: 'partial — partially compliant (EU-CSF / CSI: half points; C3A: counts as not-met)\n' },
      { text: 'planned — roadmap commitment with documented timeline (CSI Composite Generalized only: 25% of points; EU-CSF and C3A treat this as 0). REQUIRES evidence in column K: board-approved roadmap, signed project plan, or approved budget with target date.\n' },
      { text: 'n/a — not applicable (excluded from score entirely)\n' },
      { text: '\nLeave blank to skip a question.' },
    ],
  };

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  function applyDataRow(row: ExcelJS.Row, q: Question, text: string, fill: ExcelJS.Fill,
    c3aTier: string, applyEuCsf: boolean, applyC3a: boolean, applyCsi: boolean,
    guidance = '', c3aSourceId = '', euCsfFactor = '', sealEuCsf?: number, sealCsi?: number) {
    const qid = q.id;
    row.fill = fill;
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).value = c3aTier;
    row.getCell(7).value = applyEuCsf;
    row.getCell(8).value = applyC3a;
    row.getCell(9).value = applyCsi;
    row.getCell(10).value = EVIDENCE_EXPECTED[qid] ?? '';
    row.getCell(10).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(11).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(14).value = guidance;
    row.getCell(14).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(14).font = { italic: true, color: { argb: 'FF6B7280' } };
    if (c3aSourceId) row.getCell(15).value = c3aSourceId;
    if (euCsfFactor) row.getCell(16).value = euCsfFactor;
    if (sealEuCsf !== undefined) row.getCell(17).value = sealEuCsf;
    if (sealCsi !== undefined) row.getCell(18).value = sealCsi;
    row.height = Math.min(60, Math.ceil(text.length / 80) * 15 + 15);

    // Provenance columns S-X (19-24)
    const mode = questionPrimaryMode(q);
    const prov = buildProvenance(q, mode);
    const regEntry = sourceRegisterData.entries.find(e => e.key === prov.register_key);
    const frameworkName = regEntry?.name ?? prov.register_key ?? '';
    const isoClause = prov.source_text?.includes('not reproduced') ? prov.source_text : null;
    const clauseText = isoClause ?? prov.source_text ?? '';

    row.getCell(19).value = frameworkName;
    row.getCell(19).font = { color: { argb: 'FF374151' } };
    row.getCell(20).value = clauseText;
    row.getCell(20).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(21).value = prov.fidelity_badge;
    row.getCell(22).value = prov.origin_line;
    row.getCell(22).alignment = { wrapText: true, vertical: 'top' };
    // Relevant? — formula from show_when predicate if present, else static "Yes"
    const showWhen = (q as Record<string, unknown> & { relevance?: { show_when?: string } }).relevance?.show_when;
    if (showWhen) {
      const formula = toExcelFormula(showWhen, buildSheetRefs());
      row.getCell(23).value = { formula: `IF(${formula},"Yes","Hidden by scope")` };
    } else {
      row.getCell(23).value = 'Yes';
    }
    row.getCell(23).font = { color: { argb: 'FF15803D' } };
    // Risks addressed — comma-joined risk IDs from risk-register
    const riskIds = QUESTION_RISK_MAP.get(qid) ?? [];
    row.getCell(24).value = riskIds.join(', ');
    if (riskIds.length > 0) {
      row.getCell(24).font = { color: { argb: 'FFB45309' } };
    }
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
      const c3aSrc = (q as Record<string, unknown>).c3a_source_id as string ?? '';
      const euFactor = (q as Record<string, unknown>).eu_csf_source_factor as string ?? '';
      const sealEu = (q as Record<string, unknown>).seal_contribution_eu_csf as number | undefined;
      const sealCsi = (q as Record<string, unknown>).seal_contribution_csi as number | undefined;

      if (q.type === 'single') {
        if (q.text_generalized) {
          // Emit EU-specific and generalized rows; conditional formatting greys the irrelevant one
          const euTitle  = q.title;
          const genTitle = q.title_generalized ?? q.title;
          const euRow  = ws.addRow([q.id, 'eu_csf',      c3aTier, obj.id, euTitle,  q.text,             '', '', '', '', '', '', '']);
          applyDataRow(euRow,  q, q.text,             fill, c3aTier, applyEuCsf, applyC3a, applyCsi, q.supplementary_info ?? '', c3aSrc, euFactor, sealEu, sealCsi);
          const genRow = ws.addRow([q.id, 'generalized', c3aTier, obj.id, genTitle, q.text_generalized, '', '', '', '', '', '', '']);
          applyDataRow(genRow, q, q.text_generalized, fill, c3aTier, applyEuCsf, applyC3a, applyCsi, q.supplementary_info ?? '', c3aSrc, euFactor, sealEu, sealCsi);
        } else {
          const row = ws.addRow([q.id, 'single', c3aTier, obj.id, q.title, q.text, '', '', '', '', '', '', '']);
          applyDataRow(row, q, q.text, fill, c3aTier, applyEuCsf, applyC3a, applyCsi, q.supplementary_info ?? '', c3aSrc, euFactor, sealEu, sealCsi);
        }
      } else {
        // Always emit both bloc and national rows.
        // Bloc rows are greyed out for non-EU countries via conditional formatting on the Setup country cell.
        const blocText = q.tiers.bloc.text;
        const blocC3aSrc = applyC3a ? (q.tiers.bloc.source.clause.split(' ').pop() ?? '') : '';
        const blocRow = ws.addRow([q.id, 'bloc', c3aTier, obj.id, q.title, blocText, '', '', '', '', '', '', '']);
        applyDataRow(blocRow, q, blocText, fill, c3aTier, applyEuCsf, applyC3a, applyCsi, q.supplementary_info ?? '', blocC3aSrc, euFactor, sealEu, sealCsi);

        if (q.tiers.national) {
          const natText = q.tiers.national.text;
          const natC3aSrc = applyC3a ? (q.tiers.national.source.clause.split(' ').pop() ?? '') : '';
          const natRow = ws.addRow([q.id, 'national', c3aTier, obj.id, q.title, natText, '', '', '', '', '', '', '']);
          applyDataRow(natRow, q, natText, fill, c3aTier, applyEuCsf, applyC3a, applyCsi, q.supplementary_info ?? '', natC3aSrc, euFactor, sealEu, sealCsi);
        }
      }
    }
  }

  // Apply DV as single ranges to avoid overlapping ranges from per-cell assignment
  ws.dataValidations.add('L2:L500', EVIDENCE_TYPE_VALIDATION);
  ws.dataValidations.add('M2:M500', ANSWER_VALIDATION);

  // Rule 1: grey out rows where none of the user's selected frameworks apply.
  // Skipped for framework-specific templates — rows are already pre-filtered to that framework.
  if (!skipFrameworkGreying) {
    ws.addConditionalFormatting({
      ref: 'A2:X500',
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
  }

  // Rule 2: grey out EU-only rows (bloc, eu_csf) when a non-EU/EEA country is selected.
  ws.addConditionalFormatting({
    ref: 'A2:X500',
    rules: [{
      type: 'expression',
      priority: 2,
      formulae: ['AND(OR($B2="bloc",$B2="eu_csf"),LEN(Setup!$C$5)>=2,NOT(ISNUMBER(MATCH(LEFT(Setup!$C$5,2),__eu_codes__!$A:$A,0))))'],
      style: {
        font: { color: { argb: 'FFB0B7C3' } },
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF3F4F6' } },
      },
    }],
  });

  // Rule 3: grey out generalized rows when an EU/EEA country is selected.
  ws.addConditionalFormatting({
    ref: 'A2:X500',
    rules: [{
      type: 'expression',
      priority: 3,
      formulae: ['AND($B2="generalized",LEN(Setup!$C$5)>=2,ISNUMBER(MATCH(LEFT(Setup!$C$5,2),__eu_codes__!$A:$A,0)))'],
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

function addScopeSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Scope');
  ws.columns = [
    { key: 'layer', width: 8 },
    { key: 'label', width: 22 },
    { key: 'value', width: 26 },
  ];

  const headerRow = ws.addRow(['Layer', 'Facet', 'Value']);
  headerRow.font = { bold: true };
  headerRow.fill = HEADER_FILL;

  const OWNERSHIP_OPTS = '"client,commercial_lessor,provider,mixed,na"';
  const OPERATION_OPTS = '"client_staff,local_si,foreign_vendor,provider,na"';
  const DEPENDENCY_OPTS = '"self_supported_oss,licensed_supported,licensed_no_support,proprietary_inaccessible,na"';
  const LOCATION_OPTS   = '"in_country,regional_treaty,trusted_third,foreign,unknown"';

  const sheetRefs = buildSheetRefs();
  const layers = ['L1','L2','L3','L4','L5','L6'] as const;
  const LAYER_NAMES: Record<string, string> = {
    L1:'Facility', L2:'Hardware', L3:'Virtualization', L4:'Managed/PaaS', L5:'Operations', L6:'Consumption',
  };
  const facets: Array<{ key: string; label: string; opts: string }> = [
    { key: 'ownership',  label: 'Ownership',  opts: OWNERSHIP_OPTS },
    { key: 'operation',  label: 'Operation',  opts: OPERATION_OPTS },
    { key: 'dependency', label: 'Dependency', opts: DEPENDENCY_OPTS },
    { key: 'location',   label: 'Location',   opts: LOCATION_OPTS },
  ];

  for (const layer of layers) {
    for (const facet of facets) {
      const row = ws.addRow([`${layer} — ${LAYER_NAMES[layer]}`, facet.label, 'client']);
      row.getCell(3).fill = INPUT_FILL;
      row.getCell(3).dataValidation = {
        type: 'list', allowBlank: false, formulae: [facet.opts],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: `Select a value from the list`,
      } as ExcelJS.DataValidation;
      // Define named range so toExcelFormula() formulas can reference e.g. L3_dependency
      const namedKey = `${layer}.${facet.key}`;
      const rangeName = sheetRefs[namedKey]; // e.g. "L3_dependency"
      if (rangeName) {
        const cellAddr = `Scope!$C$${ws.rowCount}`;
        wb.definedNames.add(cellAddr, rangeName);
      }
    }
  }

  ws.addRow([]);
  const noteRow = ws.addRow(['', 'Fill the Value column to scope which questions are relevant for your control profile.', '']);
  noteRow.getCell(2).font = { italic: true, color: { argb: 'FF6B7280' } };
}

function addSourcesSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Sources');
  ws.columns = [
    { key: 'key',    width: 22 },
    { key: 'name',   width: 55 },
    { key: 'version', width: 30 },
    { key: 'issuer', width: 40 },
    { key: 'url',    width: 60 },
  ];

  const noteRow = ws.addRow(['Every question in this workbook is traceable to a published framework. See the Source framework / clause columns on the Assessment sheet and the full references here.']);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF374151' } };
  noteRow.getCell(1).alignment = { wrapText: true };
  ws.mergeCells(`A1:E1`);
  ws.getRow(1).height = 28;

  ws.addRow([]);

  const header = ws.addRow(['Key', 'Framework name', 'Version / date', 'Issuer', 'Official URL']);
  header.font = { bold: true };
  header.fill = HEADER_FILL;

  for (const entry of sourceRegisterData.entries) {
    const row = ws.addRow([
      entry.key,
      entry.name,
      entry.version_or_date,
      entry.issuer,
      (entry as Record<string, unknown>).official_url as string ?? '(no public URL)',
    ]);
    row.getCell(5).font = { color: { argb: 'FF1D4ED8' } };
    if ((entry as Record<string, unknown>).proposal_disclaimer) {
      row.getCell(2).font = { italic: true };
      row.getCell(2).note = { texts: [{ text: 'Proposal — not yet adopted into law. Monitor for legislative developments.' }] };
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

export async function buildTemplateXlsx(
  criteria: CriteriaFile,
  countries: CountriesFile,
  frameworkLabel?: string,
  frameworkApiId?: string,
): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cloud Sovereignty Index';
  wb.created = new Date();

  // ── Sheet 1: Scope (control-profile variables — named ranges for Excel formulas) ─
  addScopeSheet(wb);

  // ── Sheet 2: Setup ─────────────────────────────────────────────────────────
  const setup = wb.addWorksheet('Setup');
  setup.columns = [
    { width: 4 },   // A — spacer
    { width: 32 },  // B — label
    { width: 44 },  // C — input
  ];

  // Title
  setup.mergeCells('B1:C1');
  const titleCell = setup.getCell('B1');
  titleCell.value = frameworkLabel
    ? `Cloud Sovereignty Index — ${frameworkLabel} Assessment Template`
    : 'Cloud Sovereignty Index — Assessment Template';
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

  // Hidden sheet: EU/EEA country codes — referenced by conditional formatting and variant formula
  const euCodesSheet = wb.addWorksheet('__eu_codes__');
  euCodesSheet.state = 'veryHidden';
  EU_EEA_CODES.forEach((code, i) => { euCodesSheet.getCell(i + 1, 1).value = code; });

  // Row 6: computed variant — formula-driven, informational (read-only for user)
  setup.getRow(6).height = 18;
  setup.getCell('B6').value = 'Variant';
  setup.getCell('B6').font = { italic: true, color: { argb: 'FF6B7280' } };
  setup.getCell('C6').value = {
    formula: 'IF(LEN(C5)<2,"— select country above",IF(ISNUMBER(MATCH(LEFT(C5,2),__eu_codes__!$A:$A,0)),"EU-CSF (EU/EEA — both bloc and national tiers apply)","Generalized (non-EU — bloc tier rows are greyed out)"))',
    result: '— select country above',
  };
  setup.getCell('C6').font = { italic: true, color: { argb: 'FF6B7280' } };

  // Framework selection — fixed for framework-specific templates, editable for generic
  const fwFixed = !!frameworkApiId;
  const isEuCsf = frameworkApiId === 'eu_csf';
  const isC3a   = frameworkApiId === 'c3a';
  const isCsi   = frameworkApiId === 'csi_composite';
  const isCada  = frameworkApiId === 'cada';

  function setFwRow(row: number, label: string, value: 'yes' | 'no', editable: boolean) {
    setup.getRow(row).height = 20;
    setup.getCell(`B${row}`).value = label;
    setup.getCell(`B${row}`).font = { bold: !fwFixed, color: { argb: fwFixed ? 'FF9CA3AF' : 'FF111827' } };
    setup.getCell(`C${row}`).value = value;
    if (editable) {
      setup.getCell(`C${row}`).fill = INPUT_FILL;
      setup.getCell(`C${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"yes,no"'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'yes or no' } as ExcelJS.DataValidation;
    } else {
      // Fixed — grey background, no dropdown
      setup.getCell(`C${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } as ExcelJS.Fill;
      setup.getCell(`C${row}`).font = { color: { argb: value === 'yes' ? 'FF15803D' : 'FF9CA3AF' }, bold: value === 'yes' };
    }
  }

  setFwRow(7, 'EU-CSF',        isEuCsf ? 'yes' : 'no',  !fwFixed || !isEuCsf ? !fwFixed : false);
  setFwRow(8, 'C3A',           isC3a   ? 'yes' : 'no',  !fwFixed || !isC3a   ? !fwFixed : false);
  setFwRow(9, 'CSI Composite', isCsi   ? 'yes' : 'no',  !fwFixed || !isCsi   ? !fwFixed : false);
  setFwRow(10, 'CADA',         isCada  ? 'yes' : 'no',  !fwFixed || !isCada  ? !fwFixed : false);

  const uploadPath = frameworkApiId
    ? ({ eu_csf: '/start/eu-csf', c3a: '/start/c3a', csi_composite: '/start/csi', cada: '/start/cada' } as Record<string, string>)[frameworkApiId] ?? '/start/csi'
    : '/start/csi';

  setup.getRow(11).height = 16;
  setup.mergeCells('B11:C11');
  setup.getCell('B11').value = `Upload at: cloud-sovereignty-index.pages.dev${uploadPath}`;
  setup.getCell('B11').font = { color: { argb: 'FF6B7280' } };

  setup.getRow(12).height = 16;
  setup.mergeCells('B12:C12');
  const instrCell = setup.getCell('B12');
  instrCell.value = fwFixed
    ? `→ Pre-configured for ${frameworkLabel}. Fill in the "Assessment" sheet and upload.`
    : '→ Fill in the "Assessment" sheet. Rows greyed out = not required for your selected framework(s).';
  instrCell.font = { italic: true, color: { argb: 'FF1D4ED8' } };

  // Hidden row — formula-based variant for parseXlsx to read back
  setup.getRow(13).hidden = true;
  setup.getCell('B13').value = 'variant';
  setup.getCell('C13').value = {
    formula: 'IF(LEN(C5)<2,"EU-CSF",IF(ISNUMBER(MATCH(LEFT(C5,2),__eu_codes__!$A:$A,0)),"EU-CSF","Generalized"))',
    result: 'EU-CSF',
  };

  // ── Sheet 3: Assessment questions (single merged sheet) ─────────────────────
  addAssessmentSheet(wb, criteria, !!frameworkApiId);

  // ── Sheet 4: Privacy ──────────────────────────────────────────────────────
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

  // ── Sheet N: Sources (full source-register.json — provenance travels with workbook) ─
  addSourcesSheet(wb);

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

const VALID_ANSWERS = new Set(['yes', 'no', 'partial', 'planned', 'n/a']);

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
  }

  // Derive variant from country code using the same EU/EEA set embedded in the template
  if (country_code) {
    variant = EU_EEA_CODES.includes(country_code) ? 'EU-CSF' : 'Generalized';
  }

  // Read the merged Assessment sheet (v2.0) or legacy EU/Global sheets (v1.x)
  const assessmentSheet = wb.getWorksheet('Assessment');
  const legacySheets: Array<{ name: string; isEU: boolean }> = [
    { name: 'EU Assessment', isEU: true },
    { name: 'Global Assessment', isEU: false },
  ];

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

      // eu_csf and generalized rows represent the same single question — store under plain qid
      const key = (tier === 'single' || tier === 'eu_csf' || tier === 'generalized') ? qid : `${qid}:${tier}`;
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
