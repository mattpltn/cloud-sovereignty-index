import type { Country } from './schema.js';

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
  const admin = ctx.country?.national_admin_label ?? '—';
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
