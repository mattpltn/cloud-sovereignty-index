#!/usr/bin/env tsx
/**
 * Invariant validator for data/criteria.json — Patch 8 of the v2.1 change spec.
 * Run: npx tsx scripts/validate-criteria.ts
 * Also invokable via: pnpm validate
 *
 * # TODO: validate SEAL mapping
 * The seal_contribution_eu_csf / seal_contribution_csi back-fill is marked pending.
 * Invariant 9 warns on missing values but does not fail; remove the warning once
 * the SEAL mapping has been validated against the EU-CSF tender questionnaire.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../data');

interface TierLike { text: string; source: { clause: string }; seal_contribution: number; points: number }
interface Question {
  id: string; type: 'single' | 'tiered'; c3a_tier: string; tier?: string;
  applies_to_eu_csf: boolean; applies_to_c3a: boolean; applies_to_csi_composite: boolean;
  c3a_source_id?: string; eu_csf_source_factor?: string;
  seal_contribution_eu_csf?: number; seal_contribution_csi?: number;
  parent_criterion_id?: string; source?: { clause: string };
  tiers?: { bloc: TierLike; national?: TierLike };
}
interface Objective { id: string; questions: Question[] }
interface CriteriaFile { instrument_version: string; objectives: Objective[] }

// C3A v1.0 allowlist — SOV-1 through SOV-6 base + additional criteria
const C3A_ALLOWED_IDS = new Set([
  'SOV-1-01-C1','SOV-1-01-C2','SOV-1-02-C1','SOV-1-02-C2','SOV-1-03-C1','SOV-1-03-C2','SOV-1-04-C',
  'SOV-2-01-C','SOV-2-02-C1','SOV-2-02-C2','SOV-2-03-C1','SOV-2-03-C2',
  'SOV-3-01-C1','SOV-3-01-C2','SOV-3-01-C3','SOV-3-01-C4','SOV-3-01-C5',
  'SOV-3-02-C','SOV-3-02-AC',
  'SOV-3-03-C','SOV-3-03-AC1','SOV-3-03-AC2','SOV-3-03-AC3',
  'SOV-3-04-C','SOV-3-04-AC1','SOV-3-04-AC2',
  'SOV-3-05-C',
  'SOV-4-01-C1','SOV-4-01-C2','SOV-4-01-C3',
  'SOV-4-02-C1','SOV-4-02-C2',
  'SOV-4-03-C','SOV-4-03-AC',
  'SOV-4-04-C1','SOV-4-04-C2',
  'SOV-4-05-C','SOV-4-05-AC1','SOV-4-05-AC2',
  'SOV-4-06-C','SOV-4-07-C',
  'SOV-4-08-C','SOV-4-08-AC',
  'SOV-4-09-C','SOV-4-09-AC',
  'SOV-4-10-C',
  'SOV-5-01-C','SOV-5-01-AC',
  'SOV-5-02-C','SOV-5-02-AC',
  'SOV-5-03-C','SOV-5-03-AC',
  'SOV-5-04-C',
  'SOV-5-05-C1','SOV-5-05-C2',
  'SOV-6-01-C','SOV-6-02-C','SOV-6-02-AC','SOV-6-03-C',
]);

const VALID_TIERS = new Set(['bloc','national','single','eu_csf','generalized']);
const VALID_C3A_TIERS = new Set(['base','additional','not_applicable']);

let errors = 0;
let warnings = 0;

function err(msg: string) { console.error(`❌ ${msg}`); errors++; }
function warn(msg: string) { console.warn(`⚠️  ${msg}`); warnings++; }

const data: CriteriaFile = JSON.parse(readFileSync(resolve(dataDir, 'criteria.json'), 'utf-8'));

// Collect all question IDs for parent reference validation
const allIds = new Set<string>();
for (const obj of data.objectives) {
  for (const q of obj.questions) allIds.add(q.id);
}

for (const obj of data.objectives) {
  for (const q of obj.questions) {

    // 1. Every applies_to_c3a=true row has a non-empty c3a_source_id (single) or source.clause (tiered)
    if (q.applies_to_c3a) {
      if (q.type === 'single') {
        if (!q.c3a_source_id) err(`[1] ${q.id}: applies_to_c3a=true but c3a_source_id is missing`);
        // 2. c3a_source_id must be in allowlist
        else if (!C3A_ALLOWED_IDS.has(q.c3a_source_id))
          err(`[2] ${q.id}: c3a_source_id "${q.c3a_source_id}" not in C3A v1.0 allowlist`);
      } else if (q.type === 'tiered') {
        const blocId = q.tiers?.bloc.source.clause.split(' ').pop() ?? '';
        if (!blocId) err(`[1] ${q.id} (bloc): applies_to_c3a=true but source.clause missing`);
        else if (!C3A_ALLOWED_IDS.has(blocId))
          err(`[2] ${q.id} (bloc): source clause ID "${blocId}" not in C3A v1.0 allowlist`);
        if (q.tiers?.national) {
          const natId = q.tiers.national.source.clause.split(' ').pop() ?? '';
          if (!natId) err(`[1] ${q.id} (national): applies_to_c3a=true but national source.clause missing`);
          else if (!C3A_ALLOWED_IDS.has(natId))
            err(`[2] ${q.id} (national): source clause ID "${natId}" not in C3A v1.0 allowlist`);
        }
      }
    }

    // 3. Every applies_to_eu_csf=true row has eu_csf_source_factor (warn only — back-fill pending)
    if (q.applies_to_eu_csf && !q.eu_csf_source_factor) {
      warn(`[3] ${q.id}: applies_to_eu_csf=true but eu_csf_source_factor not set (back-fill pending)`);
    }

    // 5. c3a_tier values
    if (!VALID_C3A_TIERS.has(q.c3a_tier))
      err(`[5] ${q.id}: invalid c3a_tier "${q.c3a_tier}"`);

    // 6. National-tier C3A rows must not contain bare "EU" (outside "EU-CSF", "EU/EEA" compound)
    if (q.applies_to_c3a && q.type === 'tiered' && q.tiers?.national) {
      const natText = q.tiers.national.text;
      // Strip known compound uses before checking
      const stripped = natText.replace(/EU-CSF/g, '').replace(/EU\/EEA/g, '').replace(/non-EU/g, '');
      if (/\bEU\b/.test(stripped))
        err(`[6] ${q.id} (national): contains unsubstituted "EU" in national-tier C3A text: "${natText.substring(0,80)}..."`);
    }

    // 7. FB rows have applies_to_c3a=false and applies_to_eu_csf=false
    if (/-FB\d*$/.test(q.id)) {
      if (q.applies_to_c3a) err(`[7] ${q.id}: fallback row has applies_to_c3a=true`);
      if (q.applies_to_eu_csf) err(`[7] ${q.id}: fallback row has applies_to_eu_csf=true`);
    }

    // 8. AI rows have applies_to_c3a=false
    if (q.id.includes('-AI-') && q.applies_to_c3a)
      err(`[8] ${q.id}: AI row has applies_to_c3a=true`);

    // 9. seal_contribution_eu_csf / seal_contribution_csi are 0-4 or absent (TODO: validate mapping)
    for (const field of ['seal_contribution_eu_csf', 'seal_contribution_csi'] as const) {
      const val = q[field];
      if (val !== undefined) {
        if (!Number.isInteger(val) || val < 0 || val > 4)
          err(`[9] ${q.id}: ${field}=${val} is not an integer 0-4`);
      }
    }

    // 10. parent_criterion_id references an existing question id
    if (q.parent_criterion_id && !allIds.has(q.parent_criterion_id))
      err(`[10] ${q.id}: parent_criterion_id "${q.parent_criterion_id}" not found in criteria`);
  }
}

console.log(`\nValidation complete: ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) {
  console.error('FAILED');
  process.exit(1);
} else {
  console.log('PASSED');
}
