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

/** Who operates the cloud service, derived from the platform/app/ops layers. */
export function deriveOperatorLabel(profile?: ControlProfile): OperatorLabel {
  if (!profile) return PROVIDER_LABEL;
  const ops = [profile.L3?.operation, profile.L4?.operation, profile.L5?.operation];
  if (ops.includes('provider')) return PROVIDER_LABEL;
  if (ops.includes('foreign_vendor') || ops.includes('local_si')) {
    return {
      subject: 'your cloud operator', Subject: 'Your cloud operator',
      possessive: "your cloud operator's", bare: 'cloud operator', possessiveBare: "cloud operator's",
    };
  }
  // all client_staff → self-operated
  return {
    subject: 'your organisation', Subject: 'Your organisation',
    possessive: "your organisation's", bare: 'your organisation', possessiveBare: "your organisation's",
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rewrites "the cloud service provider" subject phrases to the operator label.
 *  A no-op when the operator is a provider (label === provider). */
export function reframeOperator(text: string, label: OperatorLabel): string {
  if (label === PROVIDER_LABEL) return text;
  return text
    .replace(/\bThe cloud service provider's\b/g, cap(label.possessive))
    .replace(/\bthe cloud service provider's\b/g, label.possessive)
    .replace(/\bThe cloud service provider\b/g, label.Subject)
    .replace(/\bthe cloud service provider\b/g, label.subject)
    .replace(/\bcloud service provider's\b/g, label.possessiveBare)
    .replace(/\bcloud service provider\b/g, label.bare);
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
 *   {{NATIONAL_ADMIN}}  → country.national_admin_label or "—"
 *   {{EMERGENCY_REGIME}}→ country.emergency_regime or "—"
 */
export function resolvePlaceholders(text: string, ctx: TierContext): string {
  const bloc = ctx.variant === 'EU-CSF' ? 'EU' : (ctx.country?.name ?? '—');
  const country = ctx.country?.name ?? '—';
  const admin = ctx.country?.national_admin_label ?? 'the competent national authority';
  const emergency = ctx.country?.emergency_regime ?? '—';

  const countryAdj = ctx.country?.adj ?? '—';

  return text
    .replace(/\{\{BLOC\}\}/g, bloc)
    .replace(/\{\{COUNTRY_ADJ\}\}/g, countryAdj)
    .replace(/\{\{COUNTRY\}\}/g, country)
    .replace(/\{\{NATIONAL_ADMIN\}\}/g, admin)
    .replace(/\{\{EMERGENCY_REGIME\}\}/g, emergency);
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
