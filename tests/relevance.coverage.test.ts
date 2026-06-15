import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';
import { computeCoverage, summarize, renderCoverage, type QuestionLike } from '../shared/src/coverage';

const criteria = criteriaJson as unknown as CriteriaFile;
const questions = criteria.objectives.flatMap(o => o.questions) as unknown as QuestionLike[];

describe('relevance.coverage (Cookbook §6a / §7 gate)', () => {
  const cells = computeCoverage(questions);
  const s = summarize(cells);

  test('no broken_wiring cells (predicate exists but never fires where its archetype is active)', () => {
    expect(s.brokenCells.map(c => `${c.scenario}/${c.layer}/${c.archetype}`)).toEqual([]);
  });

  test('no unjustified missing cells (active risk surface with no question)', () => {
    expect(s.missingCells.map(c => `${c.scenario}/${c.layer}/${c.archetype}`)).toEqual([]);
  });

  test('tracked coverage artifact is up to date (run: npx tsx scripts/coverage.ts --write)', () => {
    const artifact = readFileSync(resolve(__dirname, '../data/relevance-coverage.txt'), 'utf8');
    expect(artifact.trim()).toBe(renderCoverage(cells).trim());
  });
});
