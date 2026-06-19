import type { ControlProfile, LayerControl } from './schema.js';
import type { AnswerMap, EvidenceStatus } from './types.js';
import { evaluate } from './relevance.js';
import riskData from '../../data/risk-register.json';
import clauseData from '../../data/procurement-clauses.json';

export type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type ControlChannel = 'client' | 'commercial' | 'foreign_vendor' | 'foreign_provider';
export type AssuranceSignal = 'strong' | 'adequate' | 'weak' | 'unknown';

export interface Risk {
  id: string;
  layer: string;
  title: string;
  description: string;
  triggers: string;
  source_anchors: Array<{ register_key: string; clause: string }>;
  question_ids: string[];
  procurement_clause_ids: string[];
  severity_basis: string;
}

export interface ProcurementClause {
  id: string;
  layer: string;
  clause_text: string;
  source_anchors: Array<{ register_key: string; clause: string }>;
  realism_tag: string;
  applies_when: string;
}

export interface LayerReportRow {
  layer: LayerId;
  layer_name: string;
  control_channel: ControlChannel;
  assurance_signal: AssuranceSignal;
  narrative: string;
  triggered_risks: Risk[];
  bridges: ProcurementClause[];
}

const LAYER_NAMES: Record<LayerId, string> = {
  L1: 'Facility',
  L2: 'Hardware',
  L3: 'Virtualization',
  L4: 'Managed / PaaS',
  L5: 'Operations',
  L6: 'Consumption',
};

const OWNERSHIP_LABELS: Record<string, string> = {
  client: 'client-owned',
  commercial_lessor: 'commercially leased',
  provider: 'provider-owned',
  mixed: 'mixed ownership',
  na: 'not applicable',
};

const OPERATION_LABELS: Record<string, string> = {
  client_staff: 'operated by client staff',
  local_si: 'operated by a local systems integrator',
  foreign_vendor: 'operated by a foreign vendor',
  provider: 'operated by the provider',
  na: 'not applicable',
};

const DEPENDENCY_LABELS: Record<string, string> = {
  self_supported_oss: 'self-supported open-source software',
  licensed_supported: 'licensed vendor-supported software',
  licensed_no_support: 'licensed software without vendor support',
  proprietary_inaccessible: 'proprietary closed platform',
  na: 'not applicable',
};

const LOCATION_LABELS: Record<string, string> = {
  in_country: 'located in-country',
  regional_treaty: 'located in a treaty-partner jurisdiction',
  trusted_third: 'located in a trusted third-country jurisdiction',
  foreign: 'located in a foreign jurisdiction',
  unknown: 'at an unknown location',
};

function deriveControlChannel(lc: LayerControl): ControlChannel {
  const { ownership, operation, location } = lc;
  // Fully sovereign only when you BOTH own and operate the layer. A client-owned layer
  // that a third party operates is not "client" control — that is the sovereign-washing
  // case ("you own it, they hold the keys"), so operation drives the channel below.
  if (ownership === 'client' && operation === 'client_staff') return 'client';
  const foreign = location === 'foreign' || operation === 'foreign_vendor';
  // Provider owns the layer: foreign jurisdiction → foreign_provider, in-country → commercial.
  if (ownership === 'provider') return foreign ? 'foreign_provider' : 'commercial';
  // Otherwise a third party operates a client- or commercially-held layer.
  if (foreign) return 'foreign_vendor';
  // In-country third-party operation (local SI, landlord, in-country provider ops).
  return 'commercial';
}

const EVIDENCE_RANK: Record<EvidenceStatus, number> = {
  demonstrated: 3,
  documented: 2,
  vendor_claim: 1,
  unverified: 0,
};

function deriveAssuranceSignal(layerId: LayerId, questionIds: string[], answers: AnswerMap): AssuranceSignal {
  const layerPrefix = `SOV-${layerId[1]}-`;
  const relevantAnswers = Object.entries(answers).filter(
    ([qid]) => qid.startsWith(layerPrefix) || questionIds.includes(qid)
  );

  if (relevantAnswers.length === 0) return 'unknown';

  const ranks = relevantAnswers.map(([, ans]) => {
    const status = (ans.evidence_status ?? 'unverified') as EvidenceStatus;
    return EVIDENCE_RANK[status] ?? 0;
  });

  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  if (avg >= 2.5) return 'strong';
  if (avg >= 1.5) return 'adequate';
  if (avg >= 0.5) return 'weak';
  return 'weak';
}

function buildNarrative(layerId: LayerId, lc: LayerControl): string {
  const name = LAYER_NAMES[layerId];
  const own = OWNERSHIP_LABELS[lc.ownership] ?? lc.ownership;
  const op = OPERATION_LABELS[lc.operation] ?? lc.operation;
  const dep = DEPENDENCY_LABELS[lc.dependency] ?? lc.dependency;
  const loc = LOCATION_LABELS[lc.location] ?? lc.location;
  return `${name} layer: ${own}, ${op}, running ${dep}, ${loc}.`;
}

const ALL_RISKS = riskData.risks as Risk[];
const ALL_CLAUSES = clauseData.clauses as ProcurementClause[];

/**
 * All risks whose control-profile predicate fires for this profile — the structural
 * findings present regardless of any answer. Single source of truth shared by the
 * posture report (buildReport) and the questionnaire's inline findings, so the two
 * can never diverge on which risks are live.
 */
export function firedRisks(profile: ControlProfile): Risk[] {
  return ALL_RISKS.filter(risk => {
    try { return evaluate(risk.triggers, profile); }
    catch { return false; }
  });
}

export function buildReport(profile: ControlProfile, answers: AnswerMap): LayerReportRow[] {
  const layers: LayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
  const allQuestionIds = ALL_RISKS.flatMap(r => r.question_ids);
  const fired = firedRisks(profile);

  return layers.map((layerId) => {
    const lc = profile[layerId];
    const control_channel = deriveControlChannel(lc);
    const assurance_signal = deriveAssuranceSignal(layerId, allQuestionIds, answers);
    const narrative = buildNarrative(layerId, lc);

    const triggered_risks = fired.filter(risk => (risk as any).layer === layerId);

    const bridge_ids = new Set(triggered_risks.flatMap(r => r.procurement_clause_ids));
    const bridges = ALL_CLAUSES.filter(c => bridge_ids.has(c.id) && (c as any).layer === layerId);

    return { layer: layerId, layer_name: LAYER_NAMES[layerId], control_channel, assurance_signal, narrative, triggered_risks, bridges };
  });
}
