import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile } from '../shared/src/schema';

const criteria = criteriaJson as unknown as CriteriaFile;

// ── Source-of-truth counts from official documents ────────────────────────────
//
// EU-CSF: 43 questions from the Cloud III DPS XLSX calculator
//   (Annex - Sovereignty assessment calculator.xlsx)
//   Per-objective: SOV-1=8, SOV-2=6, SOV-3=5, SOV-4=6, SOV-5=7, SOV-6=5, SOV-7=7, SOV-8=4
//   CURRENT DELTA: -8 (intentional — inferred questions removed from EU-CSF scope per DR-C06)
//
// C3A: 45 base criterion IDs + 15 additional criterion IDs (from C3A PDF §2.x)
//   Tool maps these to tiered questions (each tiered question covers 2 criterion IDs)
//
// CADA: 22 questions covering all CADA Annex II criteria (manually verified vs COM(2026) 502)

const EU_CSF_SOURCE_BY_OBJECTIVE: Record<string, number> = {
  'SOV-1': 8, 'SOV-2': 6, 'SOV-3': 5, 'SOV-4': 6,
  'SOV-5': 7, 'SOV-6': 5, 'SOV-7': 7, 'SOV-8': 4,
};
const EU_CSF_SOURCE_TOTAL = 43;

// Known intentional gaps (questions excluded from EU-CSF scope due to being inferred/C3A-only)
const EU_CSF_KNOWN_GAPS = [
  'SOV-1-02', 'SOV-1-03',         // registered office + C3A control — inferred, DR-C06
  'SOV-2-02', 'SOV-2-03',         // audit rights + defense — inferred
  'SOV-3-01-C1', 'SOV-3-01-C2',   // data residency sub-questions — C3A
  'SOV-3-05-C',                    // client-side encryption — C3A §2.3.5
  'SOV-4-02', 'SOV-4-09', 'SOV-4-10', // remote work, disconnect, reconnect — C3A
  'SOV-6-02', 'SOV-6-03',         // continuous service delivery, software dev — C3A
  'SOV-8-05',                      // sustainability targets — not in XLSX
];

const C3A_SOURCE_BASE_IDS = 45;  // from C3A PDF §2.x base criteria
const C3A_SOURCE_AC_IDS = 15;    // from C3A PDF §2.x additional criteria
const CADA_EXPECTED = 29; // 22 orig + SOV-3-09-CADA + SOV-2-07-CADA + SOV-1-10-CADA + SOV-6-07-CADA + SOV-5-07-CADA + SOV-4-15-CADA + SOV-4-16-CADA + SOV-4-17-CADA - SOV-2-03

describe('Framework question count control loop', () => {

  test('EU-CSF: per-objective counts vs XLSX calculator source', () => {
    const toolByObjective: Record<string, number> = {};
    let toolTotal = 0;

    for (const obj of criteria.objectives) {
      const count = obj.questions.filter(q => q.applies_to_eu_csf).length;
      if (count > 0) {
        toolByObjective[obj.id] = count;
        toolTotal += count;
      }
    }

    // Log the diff table for visibility
    const diffs: string[] = [];
    for (const [objId, expected] of Object.entries(EU_CSF_SOURCE_BY_OBJECTIVE)) {
      const actual = toolByObjective[objId] ?? 0;
      if (actual !== expected) {
        diffs.push(`  ${objId}: source=${expected} tool=${actual} (delta ${actual - expected})`);
      }
    }

    if (diffs.length > 0) {
      console.warn(
        `EU-CSF count differs from XLSX source (total: source=${EU_CSF_SOURCE_TOTAL} tool=${toolTotal}):\n` +
        diffs.join('\n') +
        `\n  Known intentional gaps: ${EU_CSF_KNOWN_GAPS.join(', ')}`
      );
    }

    // Soft assertion: tool total should be ≥ source total - known gaps
    const maxAllowedGap = EU_CSF_KNOWN_GAPS.length;
    expect(toolTotal).toBeGreaterThanOrEqual(EU_CSF_SOURCE_TOTAL - maxAllowedGap);
    expect(toolTotal).toBeLessThanOrEqual(EU_CSF_SOURCE_TOTAL + 5); // guard against uncontrolled growth
  });

  test('C3A: base criterion count vs C3A PDF', () => {
    let toolBase = 0;
    for (const obj of criteria.objectives) {
      toolBase += obj.questions.filter(q => q.applies_to_c3a && q.c3a_tier === 'base').length;
    }

    // C3A PDF has 45 base criterion IDs; tiered questions cover 2 IDs each
    // Expect tool to have between 20 and 45 base questions (tiered = 2 IDs per question)
    if (toolBase !== C3A_SOURCE_BASE_IDS) {
      console.info(
        `C3A base: source has ${C3A_SOURCE_BASE_IDS} criterion IDs, tool has ${toolBase} questions.\n` +
        `  (Tiered questions cover 2 criterion IDs each — this is expected to be < source count)`
      );
    }
    expect(toolBase).toBeGreaterThanOrEqual(Math.floor(C3A_SOURCE_BASE_IDS / 2));
    expect(toolBase).toBeLessThanOrEqual(C3A_SOURCE_BASE_IDS);
  });

  test('C3A: additional criterion count vs C3A PDF', () => {
    let toolAc = 0;
    for (const obj of criteria.objectives) {
      toolAc += obj.questions.filter(q => q.applies_to_c3a && q.c3a_tier === 'additional').length;
    }

    if (toolAc !== C3A_SOURCE_AC_IDS) {
      console.info(
        `C3A additional: source has ${C3A_SOURCE_AC_IDS} criterion IDs, tool has ${toolAc} questions.`
      );
    }
    // AC count should be close to source (1–2 may be split into sub-criteria)
    expect(toolAc).toBeGreaterThanOrEqual(C3A_SOURCE_AC_IDS - 2);
    expect(toolAc).toBeLessThanOrEqual(C3A_SOURCE_AC_IDS + 5);
  });

  test('CADA: 22 Annex II criteria covered', () => {
    let cadaCount = 0;
    const cadaByLevel: Record<number, number> = {};
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if ((q as any).applies_to_cada) {
          cadaCount++;
          for (const level of (q as any).cada_assurance_level ?? []) {
            cadaByLevel[level] = (cadaByLevel[level] ?? 0) + 1;
          }
        }
      }
    }

    expect(cadaCount).toBe(CADA_EXPECTED);
    // All 4 UAL levels should have at least one question
    expect(cadaByLevel[1]).toBeGreaterThan(0);
    expect(cadaByLevel[2]).toBeGreaterThan(0);
    expect(cadaByLevel[3]).toBeGreaterThan(0);
    expect(cadaByLevel[4]).toBeGreaterThan(0);
  });

  test('All questions have a valid type', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        expect(['single', 'tiered'], `${q.id} has invalid type`).toContain(q.type);
      }
    }
  });

  test('All tiered questions have at least a bloc tier', () => {
    for (const obj of criteria.objectives) {
      for (const q of obj.questions) {
        if (q.type === 'tiered') {
          expect(q.tiers.bloc, `${q.id} missing bloc tier`).toBeDefined();
        }
      }
    }
  });
});
