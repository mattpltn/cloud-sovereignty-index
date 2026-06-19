#!/usr/bin/env tsx
// Generates relevance.show_when from relevance.archetypes tags (Cookbook §4).
// The TAG_MAP below is the only hand-authored mapping (question → the dependency
// it interrogates). Everything else is derived. Run after changing tags:
//
//   npx tsx scripts/gen-relevance.ts          # write changes
//   npx tsx scripts/gen-relevance.ts --check   # fail if out of sync (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateShowWhen, type ArchetypeTag, type ArchetypeId, type LayerId } from '../shared/src/archetypes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../data/criteria.json');

const t = (archetype: ArchetypeId, layer: LayerId): ArchetypeTag => ({ archetype, layer });

// 'agnostic' → always-ask (no show_when). 'manual' → keep the hand-written show_when
// (a conjunction the OR-only generator can't express). { agnostic: layer } → always-ask
// but anchor a CONCERN layer used only to re-aim "the provider" wording to the actual
// operator at that layer (no show_when, never hides). Otherwise: archetype tags.
type Spec = ArchetypeTag[] | 'agnostic' | 'manual' | { agnostic: LayerId };

const TAG_MAP: Record<string, Spec> = {
  // ── SOV-2 jurisdiction ──
  'SOV-2-01': [t('JURISDICTION', 'L1')],
  'SOV-2-02': [t('JURISDICTION', 'L1'), t('JURISDICTION', 'L2')],
  'SOV-2-03': 'manual', // (facility external) AND (platform external) — conjunction
  'SOV-2-03-CSI': [t('JURISDICTION', 'L1')],
  'SOV-2-05': [t('JURISDICTION', 'L1')],
  'SOV-2-05-CADA': [t('JURISDICTION', 'L1')],

  // ── SOV-3 provider sovereignty-service obligations (provider controls a data layer) ──
  // Re-anchored off the facility (§5.2): residency + capability questions only apply
  // when a provider actually controls the data-bearing layer.
  'SOV-3-01':    [t('DATA_RESIDENCY_SERVICE', 'L2'), t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-01-C1': [t('DATA_RESIDENCY_SERVICE', 'L2'), t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-01-C2': [t('DATA_RESIDENCY_SERVICE', 'L2'), t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-01-C5': [t('DATA_RESIDENCY_SERVICE', 'L2'), t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-02-C':  [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-02-AC': [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-03-C':  [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-03-AC1':[t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-03-AC2':[t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-03-AC3':[t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-04-C':  [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-04-AC1':[t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-04-AC2':[t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-05-C':  [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-06':    [t('DATA_RESIDENCY_SERVICE', 'L3'), t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-AI-01-AC': [t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-AI-02-AC': [t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-AI-03-AC': [t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-3-AI-04-AC': [t('DATA_RESIDENCY_SERVICE', 'L4')],
  'SOV-4-05':     [t('DATA_RESIDENCY_SERVICE', 'L3')],
  'SOV-4-05-AC1': [t('DATA_RESIDENCY_SERVICE', 'L3')],
  'SOV-4-05-AC2': [t('DATA_RESIDENCY_SERVICE', 'L3')],

  // ── SOV-4 third-party operation (§5.3: foreign-ops were dead) ──
  'SOV-4-01':    [t('THIRD_PARTY_OPERATION', 'L5')],
  'SOV-4-01-C3': [t('THIRD_PARTY_OPERATION', 'L5')],
  'SOV-4-01-FB': [t('THIRD_PARTY_OPERATION', 'L5')],
  'SOV-4-02':    [t('THIRD_PARTY_OPERATION', 'L5')],
  'SOV-4-04':      [t('THIRD_PARTY_OPERATION', 'L5'), t('JURISDICTION', 'L5')],
  'SOV-4-17-LMIC': [t('THIRD_PARTY_OPERATION', 'L5'), t('JURISDICTION', 'L5')],

  // ── reversibility (§5.4: independent of ownership — the VMware case) ──
  'SOV-4-15-CADA': [t('REVERSIBILITY', 'L4')],
  'SOV-6-01':     [t('REVERSIBILITY', 'L3'), t('REVERSIBILITY', 'L6')],
  'SOV-6-01-FB1': [t('REVERSIBILITY', 'L3'), t('REVERSIBILITY', 'L6')],
  'SOV-6-01-FB2': [t('REVERSIBILITY', 'L3'), t('REVERSIBILITY', 'L6')],
  'SOV-6-08-LMIC': [t('REVERSIBILITY', 'L4')],
  'SOV-6-09-LMIC': [t('REVERSIBILITY', 'L4')],
  'SOV-6-10-LMIC': [t('REVERSIBILITY', 'L3'), t('REVERSIBILITY', 'L4')],
  'SOV-6-11-LMIC': [t('REVERSIBILITY', 'L4')],
  'SOV-6-13-LMIC': [t('REVERSIBILITY', 'L3'), t('REVERSIBILITY', 'L4')], // §5.6 was orphaned on L6

  // ── support continuity (C3A vendor disruption) — platform and app layers ──
  'SOV-6-02':    [t('SUPPORT_CONTINUITY', 'L3'), t('SUPPORT_CONTINUITY', 'L4')],
  'SOV-6-02-AC': [t('SUPPORT_CONTINUITY', 'L3'), t('SUPPORT_CONTINUITY', 'L4')],

  // ── self-sufficiency verification (sovereign baseline) ──
  'SOV-6-03': [t('SELF_SUFFICIENCY', 'L3')],

  // ── §5.7-8 authored coverage questions (CSI/LMIC only) ──
  'SOV-2-09-CSI': [t('PHYSICAL_CUSTODY', 'L1')],                               // landlord physical access
  'SOV-4-18-CSI': [t('THIRD_PARTY_OPERATION', 'L3'), t('THIRD_PARTY_OPERATION', 'L4')], // external platform/app operator
  'SOV-6-14-CSI': [t('SELF_SUFFICIENCY', 'L3'), t('SELF_SUFFICIENCY', 'L4')],  // self-operation verification

  // ── physical custody / supply (hardware layer) ──
  'SOV-5-02':    [t('PHYSICAL_CUSTODY', 'L2'), t('JURISDICTION', 'L2')],
  'SOV-5-02-AC': [t('PHYSICAL_CUSTODY', 'L2'), t('JURISDICTION', 'L2')],
  'SOV-5-04':    [t('PHYSICAL_CUSTODY', 'L2')],

  // ── orphaned → always-ask compliance / supply (§5.5, §5.8) ──
  'SOV-7-03': 'agnostic', // NIS2 applies regardless of deployment
  'SOV-7-04': 'agnostic', // DORA applies regardless of deployment

  // ── always-ask, concern-layer anchored only to re-aim "the provider" wording to the
  //    service operator (provider scenarios resolve to provider → no reframe). Group A. ──
  'SOV-1-07':   { agnostic: 'L5' }, // operational resilience against coercion / vendor withdrawal
  'SOV-4-09-FB':{ agnostic: 'L5' }, // disconnect/reconnect plan & annual exercise
  'SOV-6-04':   { agnostic: 'L3' }, // HPC supply-chain independence
  'SOV-7-02':   { agnostic: 'L5' }, // data-protection compliance commitment
  'SOV-7-08':   { agnostic: 'L5' }, // incident disclosure & CSIRT cooperation
};

interface QRel { layer?: string; pattern: string; show_when?: string; archetypes?: ArchetypeTag[]; }
interface Q { id: string; relevance?: QRel; }

const raw = readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const questions: Q[] = data.objectives.flatMap((o: any) => o.questions);
const check = process.argv.includes('--check');

const changes: string[] = [];
for (const q of questions) {
  const spec = TAG_MAP[q.id];
  if (spec === undefined) continue;
  if (!q.relevance) q.relevance = { pattern: 'vanish' };
  const rel = q.relevance;

  if (spec === 'manual') continue;
  if (spec === 'agnostic') {
    if (rel.pattern !== 'agnostic' || rel.show_when || rel.archetypes || rel.layer) changes.push(`${q.id} → agnostic`);
    rel.pattern = 'agnostic';
    delete rel.show_when;
    delete rel.archetypes;
    delete rel.layer;
    continue;
  }
  if (!Array.isArray(spec)) {
    // { agnostic: layer } — always-ask, concern-layer anchored for wording re-aim only.
    const layer = spec.agnostic;
    if (rel.pattern !== 'agnostic' || rel.show_when || rel.archetypes || rel.layer !== layer) {
      changes.push(`${q.id} → agnostic@${layer}`);
    }
    rel.pattern = 'agnostic';
    delete rel.show_when;
    delete rel.archetypes;
    rel.layer = layer;
    continue;
  }
  const show_when = generateShowWhen(spec);
  if (rel.show_when !== show_when || JSON.stringify(rel.archetypes) !== JSON.stringify(spec)) {
    changes.push(`${q.id}: ${rel.show_when ?? '(none)'}\n        → ${show_when}`);
  }
  rel.pattern = 'vanish';
  rel.layer = spec[0].layer;
  rel.archetypes = spec;
  rel.show_when = show_when;
}

if (check) {
  if (changes.length) {
    console.error(`OUT OF SYNC (${changes.length}):\n` + changes.join('\n'));
    process.exit(1);
  }
  console.log('relevance in sync with archetype tags.');
} else {
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${changes.length} change(s):\n` + changes.join('\n'));
}
