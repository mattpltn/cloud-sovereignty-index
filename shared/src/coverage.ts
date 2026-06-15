import type { ControlProfile } from './schema.js';
import {
  ARCHETYPES, ALL_ARCHETYPES, archetypeFires,
  type ArchetypeId, type LayerId, type ArchetypeTag,
} from './archetypes.js';
import { evaluate } from './relevance.js';
import { deriveControlProfile, togglesFromDefaults, type ScenarioId } from './scoping-derive.js';

export type CoverageStatus = 'covered' | 'broken_wiring' | 'missing' | 'sovereign';

export interface CoverageCell {
  scenario: string;
  layer: LayerId;
  archetype: ArchetypeId;
  status: CoverageStatus;
  /** Questions tagged to this (archetype, layer). */
  taggedIds: string[];
  /** Of those, the ones whose predicate actually fires on this scenario profile. */
  firingIds: string[];
}

export interface QuestionLike {
  id: string;
  relevance?: {
    show_when?: string;
    archetypes?: ArchetypeTag[];
  };
}

const PRESET_SCENARIOS: Exclude<ScenarioId, 'mixed'>[] = [
  'hyperscaler', 'regional_csp', 'colocation', 'own_datacenter', 'managed_service',
];

/** Does a question's predicate fire on a profile? Agnostic (no show_when) = always. */
export function firesOn(q: QuestionLike, profile: ControlProfile): boolean {
  const sw = q.relevance?.show_when;
  return sw ? evaluate(sw, profile) : true;
}

function tagsOf(q: QuestionLike): ArchetypeTag[] {
  return q.relevance?.archetypes ?? [];
}

/**
 * Build the scenario × layer × archetype coverage matrix from the DERIVED profiles
 * (ground truth) overlaid with the question bank's archetype tags.
 */
export function computeCoverage(
  questions: QuestionLike[],
  scenarios: Exclude<ScenarioId, 'mixed'>[] = PRESET_SCENARIOS,
): CoverageCell[] {
  const cells: CoverageCell[] = [];
  for (const scenario of scenarios) {
    const profile = deriveControlProfile(togglesFromDefaults(scenario));
    for (const layer of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as LayerId[]) {
      for (const archetype of ALL_ARCHETYPES) {
        if (!ARCHETYPES[archetype].layers.includes(layer)) continue;
        const active = archetypeFires(archetype, layer, profile[layer]);
        if (!active) {
          cells.push({ scenario, layer, archetype, status: 'sovereign', taggedIds: [], firingIds: [] });
          continue;
        }
        const tagged = questions.filter(q =>
          tagsOf(q).some(t => t.archetype === archetype && t.layer === layer));
        const firing = tagged.filter(q => firesOn(q, profile));
        const status: CoverageStatus =
          tagged.length === 0 ? 'missing'
          : firing.length > 0 ? 'covered'
          : 'broken_wiring';
        cells.push({
          scenario, layer, archetype, status,
          taggedIds: tagged.map(q => q.id),
          firingIds: firing.map(q => q.id),
        });
      }
    }
  }
  return cells;
}

export interface CoverageSummary {
  covered: number;
  broken_wiring: number;
  missing: number;
  sovereign: number;
  brokenCells: CoverageCell[];
  missingCells: CoverageCell[];
}

export function summarize(cells: CoverageCell[]): CoverageSummary {
  const s: CoverageSummary = { covered: 0, broken_wiring: 0, missing: 0, sovereign: 0, brokenCells: [], missingCells: [] };
  for (const c of cells) {
    s[c.status]++;
    if (c.status === 'broken_wiring') s.brokenCells.push(c);
    if (c.status === 'missing') s.missingCells.push(c);
  }
  return s;
}

/** Human-readable matrix: one block per scenario, only the active (risk-surface) cells. */
export function renderCoverage(cells: CoverageCell[]): string {
  const lines: string[] = [];
  const scenarios = [...new Set(cells.map(c => c.scenario))];
  const ICON: Record<CoverageStatus, string> = {
    covered: '✓ covered', broken_wiring: '✗ BROKEN', missing: '✗ MISSING', sovereign: '· sovereign',
  };
  for (const scenario of scenarios) {
    lines.push(`\n## ${scenario}`);
    const active = cells.filter(c => c.scenario === scenario && c.status !== 'sovereign');
    if (active.length === 0) { lines.push('  (no active risk surfaces)'); continue; }
    for (const c of active) {
      const ids = c.firingIds.length ? c.firingIds.join(', ') : (c.taggedIds.join(', ') || '—');
      lines.push(`  ${c.layer}  ${c.archetype.padEnd(22)} ${ICON[c.status].padEnd(12)} ${ids}`);
    }
  }
  const s = summarize(cells);
  lines.push(`\n— covered=${s.covered}  broken=${s.broken_wiring}  missing=${s.missing}  sovereign=${s.sovereign}`);
  return lines.join('\n');
}
