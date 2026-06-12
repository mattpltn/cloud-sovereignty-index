import { describe, test, expect } from 'vitest';
import riskRegister from '../data/risk-register.json';
import procurementClauses from '../data/procurement-clauses.json';
import sourceRegister from '../data/source-register.json';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';

const criteria = criteriaJson as unknown as CriteriaFile;

const registerKeys = new Set(sourceRegister.entries.map(e => e.key));
const questionIds = new Set(
  criteria.objectives.flatMap(o => o.questions.map(q => q.id))
);
const clauseIds = new Set(procurementClauses.clauses.map(c => c.id));

describe('risk-register guards', () => {
  test('every risk has ≥1 source_anchor whose register_key is in source-register.json', () => {
    for (const risk of riskRegister.risks) {
      expect(risk.source_anchors.length, `${risk.id}: needs ≥1 source_anchor`).toBeGreaterThanOrEqual(1);
      for (const anchor of risk.source_anchors) {
        expect(
          registerKeys.has(anchor.register_key),
          `${risk.id}: unknown register_key "${anchor.register_key}"`
        ).toBe(true);
      }
    }
  });

  test('every risk has a non-empty severity_basis', () => {
    for (const risk of riskRegister.risks) {
      expect(
        risk.severity_basis.length,
        `${risk.id}: severity_basis must be non-empty`
      ).toBeGreaterThan(0);
    }
  });

  test('every risk.question_ids entry resolves to a question in criteria.json', () => {
    for (const risk of riskRegister.risks) {
      for (const qid of risk.question_ids) {
        expect(
          questionIds.has(qid),
          `${risk.id}: question_id "${qid}" not found in criteria.json`
        ).toBe(true);
      }
    }
  });

  test('every risk.procurement_clause_ids entry resolves in procurement-clauses.json', () => {
    for (const risk of riskRegister.risks) {
      for (const pcid of risk.procurement_clause_ids) {
        expect(
          clauseIds.has(pcid),
          `${risk.id}: procurement_clause_id "${pcid}" not found in procurement-clauses.json`
        ).toBe(true);
      }
    }
  });

  test('every procurement clause source_anchor.register_key is in source-register.json', () => {
    for (const clause of procurementClauses.clauses) {
      for (const anchor of clause.source_anchors) {
        expect(
          registerKeys.has(anchor.register_key),
          `${clause.id}: unknown register_key "${anchor.register_key}"`
        ).toBe(true);
      }
    }
  });

  test('every procurement clause applies_when is a non-empty predicate string', () => {
    for (const clause of procurementClauses.clauses) {
      expect(
        clause.applies_when.length,
        `${clause.id}: applies_when must be a non-empty predicate string`
      ).toBeGreaterThan(0);
    }
  });

  test('risk id format is consistent (RISK-L[1-6]-WORD-NN)', () => {
    const idPattern = /^RISK-L[1-6]-[A-Z0-9]+-\d+$/;
    for (const risk of riskRegister.risks) {
      expect(
        idPattern.test(risk.id),
        `${risk.id}: does not match RISK-L#-WORD-NN pattern`
      ).toBe(true);
    }
  });
});
