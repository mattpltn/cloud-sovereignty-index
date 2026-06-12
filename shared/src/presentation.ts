import type { Question } from './schema.js';
import type { FrameworkMode } from './types.js';
import { buildProvenance } from './provenance.js';

export interface CountryProfile {
  country: string;
  trusted_jurisdiction: string;
  national_csirt: string;
  eu_context: boolean;
}

export interface PresentationResult {
  title: string;
  text: string;
  shown: boolean;
  exclude_reason?: string;
  provenance_link: string;
}

const EU_MODES = new Set<FrameworkMode>(['eu_csf', 'c3a', 'cada']);

function resolvePlaceholders(text: string, profile: CountryProfile): string {
  return text
    .replace(/\{country\}/g, profile.country)
    .replace(/\{trusted_jurisdiction\}/g, profile.trusted_jurisdiction)
    .replace(/\{national_csirt\}/g, profile.national_csirt);
}

function getFallbackTitle(q: Question): string {
  return q.title;
}

function getFallbackText(q: Question): string {
  if (q.type === 'single' || q.type === 'tiered_ladder') return q.text;
  if (q.type === 'tiered') return q.tiers.bloc.text;
  return '';
}

// Resolves the display-layer representation of a question for a given mode and country context.
// For EU-CSF, C3A, and CADA modes the question's native text is used unchanged.
// For CSI/LMIC modes the csi_presentation block is used when present, with placeholders resolved.
// The provenance link always comes from buildProvenance() — the presentation layer never alters
// scoring, gates, fidelity tags, or provenance data.
export function resolvePresentation(
  question: Question,
  mode: FrameworkMode,
  profile: CountryProfile
): PresentationResult {
  const provenanceLink = buildProvenance(question, mode).origin_line;

  // EU-native modes: use source-faithful text unchanged
  if (EU_MODES.has(mode)) {
    return {
      title: getFallbackTitle(question),
      text: getFallbackText(question),
      shown: true,
      provenance_link: provenanceLink,
    };
  }

  // CSI / LMIC mode with a presentation block
  const pres = question.csi_presentation;
  if (pres) {
    const variant = profile.eu_context ? pres.variants.eu : pres.variants.non_eu;
    if (!variant.shown) {
      return {
        title: pres.title,
        text: '',
        shown: false,
        exclude_reason: (variant as { exclude_reason?: string }).exclude_reason,
        provenance_link: provenanceLink,
      };
    }
    return {
      title: pres.title,
      text: resolvePlaceholders(variant.text, profile),
      shown: true,
      provenance_link: provenanceLink,
    };
  }

  // Fallback: no csi_presentation block — return native text
  return {
    title: getFallbackTitle(question),
    text: getFallbackText(question),
    shown: true,
    provenance_link: provenanceLink,
  };
}
