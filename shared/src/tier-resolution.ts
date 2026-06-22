import type { Country, Question, ControlProfile } from './schema.js';

// ── Operator reframing (Cookbook "frame on the fine value") ───────────────────
// Many C3A-verbatim questions name "the cloud service provider" as the actor. That
// reads wrong when the customer operates the cloud themselves (colocation / own DC).
// In CSI mode we reframe the operator subject from the control profile's operation
// facet — the question stays the same, only WHO it addresses changes. C3A/EU-CSF
// source-faithful modes are never reframed.

export interface OperatorLabel {
  subject: string; Subject: string; possessive: string; bare: string; possessiveBare: string;
}

const PROVIDER_LABEL: OperatorLabel = {
  subject: 'the cloud service provider', Subject: 'The cloud service provider',
  possessive: "the cloud service provider's", bare: 'cloud service provider',
  possessiveBare: "cloud service provider's",
};
const SELF_LABEL: OperatorLabel = {
  subject: 'your organisation', Subject: 'Your organisation',
  possessive: "your organisation's", bare: 'your organisation', possessiveBare: "your organisation's",
};
const VENDOR_LABEL: OperatorLabel = {
  subject: 'your cloud operator', Subject: 'Your cloud operator',
  possessive: "your cloud operator's", bare: 'cloud operator', possessiveBare: "cloud operator's",
};
const DC_PROVIDER_LABEL: OperatorLabel = {
  subject: 'the data center provider', Subject: 'The data center provider',
  possessive: "the data center provider's", bare: 'data center provider',
  possessiveBare: "data center provider's",
};

/** Who operates the cloud SERVICE, derived from the platform/app/ops layers (L3–L5).
 *  Used as the fallback for questions with no specific concern layer. */
export function deriveOperatorLabel(profile?: ControlProfile): OperatorLabel {
  if (!profile) return PROVIDER_LABEL;
  const ops = [profile.L3?.operation, profile.L4?.operation, profile.L5?.operation];
  if (ops.includes('provider')) return PROVIDER_LABEL;
  if (ops.includes('foreign_vendor') || ops.includes('local_si')) return VENDOR_LABEL;
  return SELF_LABEL; // all client_staff → self-operated
}

/** The actor responsible at a SPECIFIC layer. Facility/hardware layers (L1/L2)
 *  resolve to the data-center provider when a third party owns the building — even
 *  though the customer runs the cloud on top — so SOV-8 facility questions address
 *  the landlord, not the self-operating customer. */
export function operatorForLayer(profile: ControlProfile | undefined, layer: string): OperatorLabel {
  if (!profile) return PROVIDER_LABEL;
  const lc = (profile as Record<string, { ownership?: string; operation?: string }>)[layer];
  if (!lc) return deriveOperatorLabel(profile);
  if (layer === 'L1' || layer === 'L2') {
    if (lc.ownership === 'client' && lc.operation === 'client_staff') return SELF_LABEL;
    // Third-party facility: a full provider stack (the CSP runs the cloud on top, e.g.
    // hyperscaler) is "the cloud service provider"; a pure landlord (you run your own
    // cloud in rented space, e.g. colocation) is "the data center provider".
    const p = profile as Record<string, { ownership?: string; operation?: string }>;
    const cloudIsProvider = ['L3', 'L4', 'L5'].some(
      l => p[l]?.ownership === 'provider' || p[l]?.operation === 'provider');
    return cloudIsProvider ? PROVIDER_LABEL : DC_PROVIDER_LABEL;
  }
  if (lc.operation === 'provider' || lc.ownership === 'provider') return PROVIDER_LABEL;
  if (lc.operation === 'foreign_vendor' || lc.operation === 'local_si') return VENDOR_LABEL;
  return SELF_LABEL;
}

/** True when an operator label is the customer themselves (self-operated), as opposed to a
 *  provider, external vendor, or data-centre landlord. Used to classify action ownership. */
export function isSelfOperated(label: OperatorLabel): boolean {
  return label.subject === SELF_LABEL.subject;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rewrites "the cloud service provider" subject phrases to the operator label.
 *  A no-op when the operator is a provider (label === provider).
 *
 *  `includeBareProvider` also rewrites the looser "the provider" phrasing — enabled
 *  only for layer-anchored questions (relevance.layer set), where the concern-layer
 *  operator is unambiguously the actor the question is about (e.g. SOV-4-01-FB at L5).
 *  It is deliberately OFF for unanchored questions, whose "the provider" usually names
 *  an external contractual party that does not cleanly re-aim to a self-run operator. */
export function reframeOperator(
  text: string,
  label: OperatorLabel,
  opts?: { includeBareProvider?: boolean },
): string {
  if (label === PROVIDER_LABEL) return text;
  let out = text
    .replace(/\bThe cloud service provider's\b/g, cap(label.possessive))
    .replace(/\bthe cloud service provider's\b/g, label.possessive)
    .replace(/\bThe cloud service provider\b/g, label.Subject)
    .replace(/\bthe cloud service provider\b/g, label.subject)
    .replace(/\bcloud service provider's\b/g, label.possessiveBare)
    .replace(/\bcloud service provider\b/g, label.bare);
  if (opts?.includeBareProvider) {
    out = out
      .replace(/\bThe provider's\b/g, cap(label.possessive))
      .replace(/\bthe provider's\b/g, label.possessive)
      .replace(/\bThe provider\b/g, label.Subject)
      .replace(/\bthe provider\b/g, label.subject);
  }
  return out;
}

/**
 * Returns the title to display for a question given the variant.
 *
 * Precedence for non-EU (Generalized) assessments:
 *   csi_presentation.title (re-aimed / clean_adapt heading) → title_generalized → title
 * EU/EEA (EU-CSF) assessments always use the canonical EU title.
 *
 * Keeps the questionnaire card, result-page accordion, and export in agreement so a non-EU
 * user never sees an EU-anchored heading (e.g. "EU HPC Independence") in one place and the
 * re-aimed one ("Independence from Foreign HPC Supply Chain") in another.
 */
export function displayTitle(q: Question, variant: 'EU-CSF' | 'Generalized'): string {
  if (variant === 'Generalized') {
    const presTitle = (q as { csi_presentation?: { title?: string } }).csi_presentation?.title;
    if (presTitle) return presTitle;
    if (q.title_generalized) return q.title_generalized;
  }
  return q.title;
}

export interface TierContext {
  variant: 'EU-CSF' | 'Generalized';
  country?: Country;
  /** If national tier answered 'yes', bloc tier is auto-satisfied */
  nationalAnsweredYes?: boolean;
}

/**
 * Resolves placeholder tokens in question text.
 *
 * Tokens:
 *   {{BLOC}}            → "EU" (EU-CSF) or country.name (Generalized)
 *   {{COUNTRY}}         → country.name or "—"
 *   {{NATIONAL_ADMIN}}      → country.national_admin_label or "—"
 *   {{EMERGENCY_REGIME}}    → country.emergency_regime or "—"
 *   {{TRUSTED_JURISDICTION}}→ data-residency fallback phrase (EU vs generic)
 */
export function resolvePlaceholders(text: string, ctx: TierContext): string {
  const bloc = ctx.variant === 'EU-CSF' ? 'EU' : (ctx.country?.name ?? '—');
  const country = ctx.country?.name ?? '—';
  const admin = ctx.country?.national_admin_label ?? 'the competent national authority';
  const emergency = ctx.country?.emergency_regime ?? '—';
  const trusted = ctx.variant === 'EU-CSF'
    ? 'the EU/EEA or an adequacy-decision country'
    : 'a trusted partner jurisdiction';

  const countryAdj = ctx.country?.adj ?? '—';

  return text
    .replace(/\{\{BLOC\}\}/g, bloc)
    .replace(/\{\{COUNTRY_ADJ\}\}/g, countryAdj)
    .replace(/\{\{COUNTRY\}\}/g, country)
    .replace(/\{\{NATIONAL_ADMIN\}\}/g, admin)
    .replace(/\{\{EMERGENCY_REGIME\}\}/g, emergency)
    .replace(/\{\{TRUSTED_JURISDICTION\}\}/g, trusted);
}

/**
 * Returns the effective tier to show a user given current context.
 *
 * For tiered questions:
 * - If no country set → show bloc tier only
 * - If country set and nationalAnsweredYes → bloc auto-satisfied, show neither (return null)
 * - If country set → show national tier (national implies bloc; ask national first)
 *
 * For single questions → always 'single'.
 */
export function effectiveTier(
  questionType: 'single' | 'tiered',
  hasNational: boolean,
  ctx: TierContext
): 'bloc' | 'national' | 'single' | null {
  if (questionType === 'single') return 'single';
  if (!ctx.country || !hasNational) return 'bloc';
  if (ctx.variant === 'Generalized') return 'national'; // no supranational bloc outside EU
  if (ctx.nationalAnsweredYes) return null; // auto-satisfied
  return 'national';
}

/**
 * Returns whether the bloc tier is auto-satisfied because the national tier was answered 'yes'.
 * (C2 ⊆ C1: national jurisdiction ⊆ bloc jurisdiction)
 */
export function isBlocAutoSatisfied(nationalValue: 'yes' | 'no' | 'partial' | 'n/a'): boolean {
  return nationalValue === 'yes';
}
