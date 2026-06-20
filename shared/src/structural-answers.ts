import type { ControlProfile, LayerControl, CriteriaFile } from './schema.js';
import type { AnswerMap } from './types.js';

// ── Structural auto-answers ───────────────────────────────────────────────────
//
// Some CSI questions ask a pure FACT that the declared control profile already
// fixes — "is the provider under domestic jurisdiction?", "is customer data resident
// in-country?", "are operating staff local?". Putting these to the user is friction at
// best and, at worst, produces phantom "the provider" wording (self-operated case) or —
// when the show/hide engine drops them — inflates the headline. So we derive the answer
// from the profile, count it like a typed answer (the worker merges these under the
// stored answers before scoring), and surface every one in a transparent end-of-flow
// panel with its reason.
//
// ONLY pure facts live here. Anything that depends on a provider OFFERING, an
// org PROCESS, or a contractual COMMITMENT (BYOK/KMS, client-side encryption, audit
// cooperation, exit drills, annual-review governance, 90-day-notice) is genuinely
// variable and stays asked. Default when unsure: keep asking (omit from the map).

type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface StructuralAnswer {
  questionId: string;
  /** Where this merges into an AnswerMap. Tiered questions score via the bloc tier in
   *  CSI/generalized mode; a tiered 'no' only counts if written at `${id}:bloc` (a
   *  national-tier 'no' scores 0/0 and would vanish). Single questions use the bare id. */
  answerKey: string;
  tier: 'single' | 'bloc';
  value: 'yes' | 'no';
  reason: string;
}

interface Resolver {
  /** true → the determined answer is 'yes'. */
  test: (p: ControlProfile) => boolean;
  yes: string;
  no: (p: ControlProfile) => string;
}

const SERVICE_LAYERS: LayerId[] = ['L3', 'L4', 'L5'];
const DATA_LAYERS: LayerId[] = ['L2', 'L3', 'L4'];
const INFRA_LAYERS: LayerId[] = ['L1', 'L2', 'L3', 'L4'];

const LAYER_NAME: Record<LayerId, string> = {
  L1: 'facility', L2: 'hardware', L3: 'virtualization', L4: 'managed/PaaS', L5: 'operations', L6: 'consumption',
};

/** A layer is non-domestic if its location is anything but in-country, or a foreign vendor operates it. */
function nonDomestic(lc: LayerControl): boolean {
  return lc.location !== 'in_country' || lc.operation === 'foreign_vendor';
}

function offending(p: ControlProfile, layers: LayerId[]): LayerId[] {
  return layers.filter(L => nonDomestic(p[L]));
}

function nameList(layers: LayerId[]): string {
  return layers.map(L => LAYER_NAME[L]).join(', ');
}

/** Fact resolver over a set of layers: 'yes' iff every layer is domestic. */
function locatedDomestic(layers: LayerId[], yes: string, noun: string): Resolver {
  return {
    test: (p) => offending(p, layers).length === 0,
    yes,
    no: (p) => `${noun} — a non-domestic jurisdiction applies at the ${nameList(offending(p, layers))} layer.`,
  };
}

const TIERED = new Set([
  'SOV-1-01', 'SOV-1-02', 'SOV-1-03', 'SOV-3-01', 'SOV-4-01', 'SOV-4-04',
]);

// Pure-fact questions only. Reviewed against the verbatim wording (see assessment notes).
const STRUCTURAL_MAP: Record<string, Resolver> = {
  // SOV-1 — provider domicile: determined by where the cloud service is operated (L3–L5).
  'SOV-1-01': locatedDomestic(SERVICE_LAYERS, 'the cloud service is operated entirely in-country, so it falls under domestic jurisdiction.', 'the cloud service'),
  'SOV-1-02': locatedDomestic(SERVICE_LAYERS, 'the operator is established in-country.', 'the operator'),
  'SOV-1-03': locatedDomestic(SERVICE_LAYERS, 'the operating layers are all domestic, so effective control is in-country.', 'effective control of the service'),

  // SOV-3 — data residency: determined by where the data-bearing layers (L2–L4) sit.
  'SOV-3-01':    locatedDomestic(DATA_LAYERS, 'all data-bearing layers are in-country, so customer data is resident domestically.', 'customer data'),
  'SOV-3-01-C2': locatedDomestic(DATA_LAYERS, 'all data-bearing layers are in-country, so derived and account data are resident domestically.', 'derived/account data'),
  'SOV-3-01-C5': locatedDomestic(DATA_LAYERS, 'all data-bearing layers are in-country, so provider data is resident domestically.', 'provider data'),

  // SOV-4 — operating personnel & SOC: determined by the operations layer (L5).
  'SOV-4-01':    locatedDomestic(['L5'], 'operations are run in-country, so operating personnel are local.', 'operating personnel'),
  'SOV-4-01-C3': locatedDomestic(['L5'], 'the operating organisation is in-country.', 'the operating organisation'),
  'SOV-4-01-FB': locatedDomestic(['L5'], 'privileged personnel operate from in-country.', 'privileged personnel'),
  'SOV-4-04':    locatedDomestic(['L5'], 'the SOC is operated in-country.', 'the security operations centre'),

  // SOV-4-13-CADA — infrastructure & assets location (L1–L4).
  'SOV-4-13-CADA': locatedDomestic(INFRA_LAYERS, 'all infrastructure and assets are located in-country.', 'service infrastructure and assets'),
};

/** Question ids the engine auto-answers (used by the questionnaire to drop them from the flow). */
export const STRUCTURAL_QUESTION_IDS: readonly string[] = Object.keys(STRUCTURAL_MAP);

/** Resolve the determined answers for a control profile. */
export function structuralAnswers(profile: ControlProfile, _criteria?: CriteriaFile): StructuralAnswer[] {
  const out: StructuralAnswer[] = [];
  for (const [questionId, r] of Object.entries(STRUCTURAL_MAP)) {
    const yes = r.test(profile);
    const tiered = TIERED.has(questionId);
    out.push({
      questionId,
      answerKey: tiered ? `${questionId}:bloc` : questionId,
      tier: tiered ? 'bloc' : 'single',
      value: yes ? 'yes' : 'no',
      reason: yes ? r.yes : r.no(profile),
    });
  }
  return out;
}

/**
 * Merge structural auto-answers UNDER an existing answer set: a manual answer at the same
 * key always wins (the user can override in the transparency panel). Returns a new map.
 */
export function mergeStructuralAnswers(answers: AnswerMap, profile: ControlProfile, criteria?: CriteriaFile): AnswerMap {
  const merged: AnswerMap = { ...answers };
  for (const sa of structuralAnswers(profile, criteria)) {
    if (merged[sa.answerKey] != null) continue; // manual override wins
    merged[sa.answerKey] = { tier: sa.tier, value: sa.value, evidence_status: 'documented' };
  }
  return merged;
}
