import type { Question } from './schema.js';
import type { FrameworkMode } from './types.js';
import sourceRegister from '../../data/source-register.json';

export interface SourceBlock {
  fidelity_badge: string;
  origin_line: string;
  source_text: string | null;
  register_key: string | null;
}

type RegisterEntry = { key: string; license_posture: string; name: string; proposal_disclaimer?: boolean };
const registerByKey = new Map<string, RegisterEntry>(
  (sourceRegister.entries as RegisterEntry[]).map(e => [e.key, e])
);

// Maps a free-text framework name from lmic_anchors to a register key.
const FRAMEWORK_KEY_MAP: Record<string, string> = {
  'EU Data Act (Reg. 2023/2854)': 'eu-data-act',
  'EU Data Act': 'eu-data-act',
  'Regulation (EU) 2023/2854 (Data Act)': 'eu-data-act',
  'DORA (Reg. 2022/2554)': 'dora',
  'CADA COM(2026) 502': 'cada',
  'EU-CSF v1.2.1': 'eu-csf',
  'C3A': 'c3a',
  'EBA/GL/2019/02': 'eba-gl-2019-02',
  'NIST SP 800-53 Rev. 5': 'nist-sp-800-53-r5',
  'ISO/IEC 27001': 'iso-27001',
  'ISO/IEC 27017': 'iso-27017',
  'ISO/IEC 19086-1': 'iso-19086-1',
  'ISO/IEC 19941': 'iso-19941',
  'ISO 22301': 'iso-22301',
  'SWIPO IaaS Code of Conduct v3.0': 'swipo-iaas-v3',
  'SWIPO IaaS Code of Conduct': 'swipo-iaas-v3',
  'OpenInfra Foundation — Interop Working Group': 'openinfra-interop',
  'OpenInfra Foundation': 'openinfra-interop',
  'World Bank Procurement Regulations for IPF Borrowers, 7th ed. (Sep 2025)': 'world-bank-pr-7th',
  'World Bank Procurement Regulations for IPF Borrowers': 'world-bank-pr-7th',
  'World Bank Procurement Regulations, 7th ed. (2025)': 'world-bank-pr-7th',
  'CSI (existing)': 'csi',
  'CSI': 'csi',
};

export function resolveRegisterKey(framework: string): string | null {
  return FRAMEWORK_KEY_MAP[framework] ?? null;
}

function isIso(key: string | null): boolean {
  return key !== null && key.startsWith('iso-');
}

// Builds a provenance SourceBlock from a question for a given rendering mode.
// Normalizes mode-specific fields (eu_csf_fidelity, c3a_fidelity, cada_fidelity, lmic_sourcing)
// into a single SourceBlock that all renderers consume.
export function buildProvenance(question: Question, mode: FrameworkMode): SourceBlock {
  // EU-CSF mode
  if (mode === 'eu_csf') {
    const fidelity = question.eu_csf_fidelity ?? 'csi';
    const rationale = question.eu_csf_fidelity_rationale;
    const sourceFactor = question.eu_csf_source_factor;

    if (fidelity === 'direct') {
      // Extract source depending on question type
      let doc: string | undefined;
      let clause: string | undefined;
      if (question.type === 'single' || question.type === 'tiered_ladder') {
        doc = question.source?.doc;
        clause = question.source?.clause;
      } else if (question.type === 'tiered') {
        doc = question.tiers.bloc.source.doc;
        clause = question.tiers.bloc.source.clause;
      } else if (question.type === 'eu_csf') {
        // eu_csf type questions: use source_factor as clause reference
        doc = 'EU-CSF v1.2.1';
        clause = sourceFactor;
      }
      const key = doc ? (FRAMEWORK_KEY_MAP[doc] ?? 'eu-csf') : 'eu-csf';
      const reg = registerByKey.get(key);
      return {
        fidelity_badge: 'direct',
        origin_line: `This question comes from ${doc ?? 'EU-CSF v1.2.1'}${clause ? ', ' + clause : ''}.`,
        source_text: reg && !isIso(key) ? (clause ?? sourceFactor ?? null) : (isIso(key) ? `ISO/IEC clause ${clause} (text not reproduced for licensing reasons)` : null),
        register_key: key,
      };
    }

    if (fidelity === 'inferred') {
      return {
        fidelity_badge: 'inferred',
        origin_line: `This question is derived from EU-CSF v1.2.1${sourceFactor ? ' (' + sourceFactor + ')' : ''}. It is not verbatim — here is why we include it: ${rationale ?? '(see decisions register)'}`,
        source_text: sourceFactor ?? null,
        register_key: 'eu-csf',
      };
    }

    // csi — tool-added question
    return {
      fidelity_badge: 'csi',
      origin_line: 'This question is a CSI editorial addition to the EU-CSF set. It is scored but its absence does not block SEAL levels derived from the official EU-CSF framework.',
      source_text: null,
      register_key: 'eu-csf',
    };
  }

  // C3A mode
  if (mode === 'c3a') {
    const fidelity = question.c3a_fidelity ?? 'csi';
    const rationale = question.c3a_fidelity_rationale;

    if (fidelity === 'direct') {
      let doc: string | undefined;
      let clause: string | undefined;
      if (question.type === 'single' || question.type === 'tiered_ladder') {
        doc = question.source?.doc;
        clause = question.source?.clause;
      } else if (question.type === 'tiered') {
        doc = question.tiers.bloc.source.doc;
        clause = question.tiers.bloc.source.clause;
      }
      return {
        fidelity_badge: 'direct',
        origin_line: `This question comes from ${doc ?? 'BSI C3A v1.0'}${clause ? ', ' + clause : ''}.`,
        source_text: clause ?? null,
        register_key: 'c3a',
      };
    }

    if (fidelity === 'inferred') {
      return {
        fidelity_badge: 'inferred',
        origin_line: `This question is derived from BSI C3A v1.0. It is not verbatim — here is why we include it: ${rationale ?? '(see decisions register)'}`,
        source_text: rationale ?? null,
        register_key: 'c3a',
      };
    }

    return {
      fidelity_badge: 'csi',
      origin_line: 'This question is a CSI editorial addition to the C3A set.',
      source_text: null,
      register_key: 'c3a',
    };
  }

  // CADA mode
  if (mode === 'cada') {
    const fidelity = question.cada_fidelity ?? 'csi';
    const rationale = question.cada_fidelity_rationale;
    const annexRef = question.cada_annex_ref;

    if (fidelity === 'direct') {
      return {
        fidelity_badge: 'direct',
        origin_line: `This question comes from CADA COM(2026) 502 (proposal, not yet adopted law), ${annexRef ?? 'Annex II/III'}.`,
        source_text: annexRef ?? null,
        register_key: 'cada',
      };
    }

    if (fidelity === 'inferred') {
      return {
        fidelity_badge: 'inferred',
        origin_line: `This question is derived from CADA COM(2026) 502 (proposal). It is not verbatim — here is why we include it: ${rationale ?? '(see decisions register)'}`,
        source_text: rationale ?? null,
        register_key: 'cada',
      };
    }

    return {
      fidelity_badge: 'csi',
      origin_line: 'This question is a CSI addition mapped to CADA objectives.',
      source_text: null,
      register_key: 'cada',
    };
  }

  // LMIC mode
  if (mode === 'lmic') {
    const sourcing = question.lmic_sourcing ?? 'grounded-new';
    const anchors = question.lmic_anchors ?? [];
    const rationale = question.lmic_rationale;
    const primaryAnchor = anchors[0];
    const registerKey = primaryAnchor ? resolveRegisterKey(primaryAnchor.framework) : null;
    const reg = registerKey ? registerByKey.get(registerKey) : null;

    if (sourcing === 'grounded-new') {
      const anchorList = anchors.map(a => `${a.framework} ${a.ref}`).join('; ');
      const sourceText = reg && isIso(registerKey)
        ? `${primaryAnchor?.framework ?? ''} clause ${primaryAnchor?.ref ?? ''} (text not reproduced for licensing reasons)`
        : (primaryAnchor ? `${primaryAnchor.ref}` : null);
      return {
        fidelity_badge: 'grounded-new',
        origin_line: `No single framework contains this control. It is grounded in: ${anchorList}. ${rationale ? 'Rationale: ' + rationale : ''}`,
        source_text: sourceText,
        register_key: registerKey,
      };
    }

    if (sourcing === 'adapt') {
      const parentRef = primaryAnchor ? `${primaryAnchor.framework} ${primaryAnchor.ref}` : 'a parent control';
      return {
        fidelity_badge: 'adapt',
        origin_line: `This question adapts ${parentRef} for the LMIC procurement context. ${rationale ? 'What changed: ' + rationale : ''}`,
        source_text: primaryAnchor ? primaryAnchor.ref : null,
        register_key: registerKey,
      };
    }

    if (sourcing === 'editorial') {
      return {
        fidelity_badge: 'editorial',
        origin_line: `This is an editorial operationalization${primaryAnchor ? ' of ' + primaryAnchor.framework : ''}. It is scored but never gated. ${rationale ?? ''}`,
        source_text: null,
        register_key: registerKey,
      };
    }

    if (sourcing === 'port') {
      return {
        fidelity_badge: 'port',
        origin_line: `This question ports ${primaryAnchor?.framework ?? 'an existing control'} to the LMIC context with minimal change.`,
        source_text: primaryAnchor ? primaryAnchor.ref : null,
        register_key: registerKey,
      };
    }

    // reuse
    return {
      fidelity_badge: 'reuse',
      origin_line: `This question is reused from the existing CSI question set for LMIC mode.`,
      source_text: null,
      register_key: registerKey,
    };
  }

  // CSI Composite mode — fall back to EU-CSF provenance
  return buildProvenance(question, 'eu_csf');
}
