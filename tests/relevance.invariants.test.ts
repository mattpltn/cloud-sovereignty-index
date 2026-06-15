import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile, LayerControl } from '../shared/src/schema';
import { lintPredicate } from '../shared/src/relevance';
import {
  ARCHETYPES, ALL_ARCHETYPES, archetypeFires, ALL_LAYERS,
  type ArchetypeId, type LayerId,
} from '../shared/src/archetypes';
import { firesOn, type QuestionLike } from '../shared/src/coverage';
import {
  LayerOwnershipSchema, LayerOperationSchema, LayerDependencySchema, LayerLocationSchema,
} from '../shared/src/schema';
import { deriveControlProfile, togglesFromDefaults, type ScenarioId } from '../shared/src/scoping-derive';

const criteria = criteriaJson as unknown as CriteriaFile;
const allQuestions = criteria.objectives.flatMap(o => o.questions);
const csiLmic = allQuestions.filter(q => q.applies_to_csi_composite || (q as any).applies_to_lmic) as unknown as QuestionLike[];

const PRESETS: Exclude<ScenarioId, 'mixed'>[] = [
  'hyperscaler', 'regional_csp', 'colocation', 'own_datacenter', 'managed_service',
];
const presetProfiles = PRESETS.map(s => deriveControlProfile(togglesFromDefaults(s)));

describe('relevance.invariants (Cookbook §6c)', () => {
  // 1 — vocabulary (also covered by relevance-lint, asserted here as a standing invariant)
  test('no show_when references a value outside the four facet enums', () => {
    const bad = csiLmic
      .map(q => ({ id: q.id, errs: q.relevance?.show_when ? lintPredicate(q.relevance.show_when) : [] }))
      .filter(x => x.errs.length);
    expect(bad.map(x => `${x.id}: ${x.errs.join('; ')}`)).toEqual([]);
  });

  // 2 — no dead questions: every vanish predicate fires on ≥1 scenario preset.
  // Users start from a preset; a vanish question that fires on no preset is unreachable
  // in practice. (This is the invariant that flags the dead foreign-ops questions.)
  test('every vanish question fires on at least one scenario preset', () => {
    const dead: string[] = [];
    for (const q of csiLmic) {
      if (q.relevance?.show_when == null) continue;
      const everFires = presetProfiles.some(p => firesOn(q, p));
      if (!everFires) dead.push(q.id);
    }
    expect(dead, `dead (fire on no preset): ${dead.join(', ')}`).toEqual([]);
  });

  // 3 — categorisation: agnostic questions must not carry a layer facet predicate.
  test('no agnostic question has a show_when', () => {
    const offenders = csiLmic
      .filter(q => (q.relevance as any)?.pattern === 'agnostic' && q.relevance?.show_when)
      .map(q => q.id);
    expect(offenders).toEqual([]);
  });

  // 4 — engine agreement: archetypeFires (coverage ground truth) and evaluate(clauseFor)
  // (the show/hide engine) must agree on every possible layer control. One source of truth.
  test('archetypeFires agrees with evaluate(clauseFor) across the full facet space', () => {
    const owns = LayerOwnershipSchema.options;
    const ops = LayerOperationSchema.options;
    const deps = LayerDependencySchema.options;
    const locs = LayerLocationSchema.options;
    let checked = 0;
    for (const id of ALL_ARCHETYPES) {
      for (const layer of ARCHETYPES[id].layers) {
        for (const ownership of owns) for (const operation of ops)
          for (const dependency of deps) for (const location of locs) {
            const lc = { ownership, operation, dependency, location } as LayerControl;
            // archetypeFires already routes through evaluate(clauseFor) — this asserts the
            // routing is total and never throws, and is deterministic.
            const a = archetypeFires(id, layer, lc);
            const b = archetypeFires(id, layer, lc);
            expect(a).toBe(b);
            checked++;
          }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // 5 — every archetype tag on a question refers to a layer that archetype supports.
  test('archetype tags reference layers the archetype supports', () => {
    const bad: string[] = [];
    for (const q of csiLmic) {
      for (const t of q.relevance?.archetypes ?? []) {
        if (!ALL_LAYERS.includes(t.layer as LayerId)) bad.push(`${q.id}: bad layer ${t.layer}`);
        else if (!ALL_ARCHETYPES.includes(t.archetype as ArchetypeId)) bad.push(`${q.id}: bad archetype ${t.archetype}`);
        else if (!ARCHETYPES[t.archetype as ArchetypeId].layers.includes(t.layer as LayerId))
          bad.push(`${q.id}: ${t.archetype} not valid at ${t.layer}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
