#!/usr/bin/env tsx
// Coverage report CLI. Prints the scenario × layer × archetype matrix and exits
// non-zero if any cell is broken_wiring or unjustified missing.
//
//   npx tsx scripts/coverage.ts            # print + gate
//   npx tsx scripts/coverage.ts --report   # print only (no exit code)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeCoverage, summarize, renderCoverage, type QuestionLike } from '../shared/src/coverage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const criteria = JSON.parse(readFileSync(resolve(__dirname, '../data/criteria.json'), 'utf8'));
const questions: QuestionLike[] = criteria.objectives.flatMap((o: any) => o.questions);

const cells = computeCoverage(questions);
const rendered = renderCoverage(cells);
console.log(rendered);

// --write refreshes the tracked artifact future PRs diff against.
if (process.argv.includes('--write')) {
  const ARTIFACT = resolve(__dirname, '../data/relevance-coverage.txt');
  writeFileSync(ARTIFACT, rendered.trimStart() + '\n');
  console.log(`\nwrote ${ARTIFACT}`);
}

const s = summarize(cells);
const reportOnly = process.argv.includes('--report') || process.argv.includes('--write');
if (!reportOnly && (s.broken_wiring > 0 || s.missing > 0)) {
  console.error(`\nFAIL: ${s.broken_wiring} broken_wiring, ${s.missing} missing cell(s).`);
  process.exit(1);
}
