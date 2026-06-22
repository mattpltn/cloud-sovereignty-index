import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { actionOwnerForQuestion, actionOwnerForClause } from '@shared/action-owner';
import type { CriteriaFile, ControlProfile, Question } from '@shared/schema';

const criteria: CriteriaFile = JSON.parse(
  readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf-8')
);
const clauses = JSON.parse(
  readFileSync(resolve(__dirname, '../data/procurement-clauses.json'), 'utf-8')
).clauses as Array<{ id: string; realism_tag?: string }>;

const Q = (id: string): Question =>
  criteria.objectives.flatMap(o => o.questions).find(q => q.id === id)!;

const mk = (o: string, op: string, d: string, l: string) =>
  ({ ownership: o, operation: op, dependency: d, location: l }) as ControlProfile['L1'];
const SELF_RUN: ControlProfile = (['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const).reduce(
  (a, L) => { a[L] = mk('client', 'client_staff', 'self_supported_oss', 'in_country'); return a; }, {} as ControlProfile);
const HYPERSCALER: ControlProfile = (['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const).reduce(
  (a, L) => { a[L] = mk('provider', 'provider', 'proprietary_inaccessible', 'foreign'); return a; }, {} as ControlProfile);

describe('action-owner classifier', () => {
  it('SELF_SUFFICIENCY questions are internal', () => {
    expect(actionOwnerForQuestion(Q('SOV-6-14-CSI'), HYPERSCALER)).toBe('internal');
    expect(actionOwnerForQuestion(Q('SOV-6-03'), HYPERSCALER)).toBe('internal');
  });

  it('other-archetype questions are supplier', () => {
    expect(actionOwnerForQuestion(Q('SOV-2-01'), SELF_RUN)).toBe('supplier'); // JURISDICTION
    expect(actionOwnerForQuestion(Q('SOV-2-05'), SELF_RUN)).toBe('supplier');
  });

  it('untagged question follows the resolved operator at its layer (profile-dependent)', () => {
    const untagged = Q('SOV-1-07'); // layer L5, no archetypes
    expect(actionOwnerForQuestion(untagged, SELF_RUN)).toBe('internal');   // self-operated L5
    expect(actionOwnerForQuestion(untagged, HYPERSCALER)).toBe('supplier'); // provider-operated L5
  });

  it('untagged question with no profile defaults to supplier', () => {
    expect(actionOwnerForQuestion(Q('SOV-1-07'), null)).toBe('supplier');
  });

  it('clauses: internal_control → internal, everything else → supplier', () => {
    const internal = clauses.find(c => c.realism_tag === 'internal_control')!;
    expect(actionOwnerForClause(internal)).toBe('internal');
    expect(actionOwnerForClause({ realism_tag: 'standard_market_term' })).toBe('supplier');
    expect(actionOwnerForClause({ realism_tag: 'negotiable' })).toBe('supplier');
  });
});
