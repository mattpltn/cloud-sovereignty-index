import type { Question, ControlProfile } from './schema.js';
import { operatorForLayer, deriveOperatorLabel, isSelfOperated } from './tier-resolution.js';
import { providerForeign } from './structural-answers.js';

// ── Action ownership (supplier-management vs internal-improvement) ─────────────
//
// A report is only actionable if the reader can tell WHO must act on each finding:
//   • 'supplier'  — require it from the cloud provider / put it in the contract
//   • 'internal'  — a control the customer's own organisation must build and operate
//   • 'inherent'  — an in-country LOCATION mandate the chosen provider cannot satisfy
//                   (foreign provider): not a contractable clause, a residual risk to
//                   mitigate by choosing an in-country/sovereign provider, or to accept.
//
// No new data field is needed. The owner is DERIVED from existing metadata, and it
// mirrors how the questionnaire already re-aims question wording (reframeOperator), so
// the badge can never contradict the displayed "Does your organisation… / Does the
// provider…" phrasing. It is deliberately profile-dependent: the SAME reversibility
// question is an internal engineering action for a self-run OSS stack but a supplier
// contract ask against a hyperscaler.

export type ActionOwner = 'internal' | 'supplier' | 'inherent';

interface ArchetypeTag { archetype: string; layer: string }

/**
 * Classify a question (hence any gap/blocker keyed by its id) as a supplier or internal action.
 *  1. SELF_SUFFICIENCY archetype → internal (fires only when the client self-supports + self-operates).
 *  2. Any of the other six archetypes → supplier (they fire only on lessor/provider/foreign/licensed facets).
 *  3. Untagged → resolve the operator at the concern layer; self-operated → internal, else supplier.
 *     With no profile (offline) the strategic/provider-phrased default is supplier.
 */
export function actionOwnerForQuestion(q: Question, profile?: ControlProfile | null): ActionOwner {
  // 0. A criterion the chosen (foreign) provider structurally cannot satisfy → inherent.
  if ((q as { foreign_provider_precluded?: boolean }).foreign_provider_precluded && profile && providerForeign(profile)) {
    return 'inherent';
  }
  const archetypes = (q as { relevance?: { archetypes?: ArchetypeTag[]; layer?: string } }).relevance?.archetypes;
  if (archetypes && archetypes.length > 0) {
    return archetypes.some(a => a.archetype === 'SELF_SUFFICIENCY') ? 'internal' : 'supplier';
  }
  if (profile) {
    const layer = (q as { relevance?: { layer?: string } }).relevance?.layer;
    const label = layer ? operatorForLayer(profile, layer) : deriveOperatorLabel(profile);
    return isSelfOperated(label) ? 'internal' : 'supplier';
  }
  return 'supplier';
}

/** Classify a procurement clause. The `internal_control` realism_tag is the authoritative
 *  marker for a customer-internal control (the rest are provider contract obligations). */
export function actionOwnerForClause(clause: { realism_tag?: string }): ActionOwner {
  return clause.realism_tag === 'internal_control' ? 'internal' : 'supplier';
}

/** Display copy for an owner, shared by web pills and the PDF labels. */
export const ACTION_OWNER_LABEL: Record<ActionOwner, string> = {
  supplier: 'Provider / contract',
  internal: 'Internal',
  inherent: 'Residual / inherent',
};
