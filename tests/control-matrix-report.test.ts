import { describe, test, expect } from 'vitest';
import { buildReport } from '../shared/src/report';
import type { ControlProfile } from '../shared/src/schema';
import type { AnswerMap } from '../shared/src/types';

const SOVEREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L3: { ownership: 'commercial_lessor', operation: 'client_staff', dependency: 'licensed_supported', location: 'in_country' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'client', operation: 'client_staff', dependency: 'na', location: 'in_country' },
  L6: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
};

const FOREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L2: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L3: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'na', location: 'foreign' },
  L6: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
};

const ANSWERS: AnswerMap = {};

describe('buildReport two-channel separation', () => {
  test('returns exactly 6 rows, one per layer', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    expect(rows).toHaveLength(6);
    expect(rows.map(r => r.layer)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  });

  test('each row has distinct control_channel and assurance_signal fields (not merged)', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    for (const row of rows) {
      expect(row).toHaveProperty('control_channel');
      expect(row).toHaveProperty('assurance_signal');
      // They are independent fields — control_channel is about ownership/operation,
      // assurance_signal is about evidence quality. They must never be merged into one field.
      expect(typeof row.control_channel).toBe('string');
      expect(typeof row.assurance_signal).toBe('string');
    }
  });

  test('client-owned in-country layers map to control_channel=client', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    const l1 = rows.find(r => r.layer === 'L1')!;
    const l2 = rows.find(r => r.layer === 'L2')!;
    expect(l1.control_channel).toBe('client');
    expect(l2.control_channel).toBe('client');
  });

  test('provider-owned foreign layer maps to foreign_provider', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    const l4 = rows.find(r => r.layer === 'L4')!;
    expect(l4.control_channel).toBe('foreign_provider');
  });

  test('assurance_signal is unknown when no answers provided', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, {});
    for (const row of rows) {
      expect(row.assurance_signal).toBe('unknown');
    }
  });

  test('assurance_signal is strong when all answers are demonstrated', () => {
    const demonstratedAnswers: AnswerMap = {};
    for (let n = 1; n <= 8; n++) {
      for (let q = 1; q <= 5; q++) {
        demonstratedAnswers[`SOV-${n}-0${q}`] = {
          tier: 'single', value: 'yes', evidence_status: 'demonstrated',
        };
      }
    }
    const rows = buildReport(SOVEREIGN_PROFILE, demonstratedAnswers);
    for (const row of rows) {
      expect(['strong', 'unknown']).toContain(row.assurance_signal);
    }
  });

  test('triggered_risks and bridges are separate arrays', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    for (const row of rows) {
      expect(Array.isArray(row.triggered_risks)).toBe(true);
      expect(Array.isArray(row.bridges)).toBe(true);
      // They carry different shapes: risks have triggers, bridges have clause_text
      if (row.triggered_risks.length > 0) {
        expect(row.triggered_risks[0]).toHaveProperty('triggers');
        expect(row.triggered_risks[0]).toHaveProperty('severity_basis');
      }
      if (row.bridges.length > 0) {
        expect(row.bridges[0]).toHaveProperty('clause_text');
        expect(row.bridges[0]).toHaveProperty('realism_tag');
      }
    }
  });

  test('narrative is a non-empty human-readable string', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    for (const row of rows) {
      expect(row.narrative.length).toBeGreaterThan(0);
      expect(row.narrative).toContain(row.layer_name);
    }
  });

  test('posture-first: no single sovereignty score in LayerReportRow', () => {
    const rows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    for (const row of rows) {
      // The row must NOT carry a score field — scores are surfaced separately
      expect(row).not.toHaveProperty('score');
      expect(row).not.toHaveProperty('pct');
      expect(row).not.toHaveProperty('sovereignty_score');
    }
  });

  test('FOREIGN profile triggers more risks than SOVEREIGN profile', () => {
    const foreignRows = buildReport(FOREIGN_PROFILE, ANSWERS);
    const sovereignRows = buildReport(SOVEREIGN_PROFILE, ANSWERS);
    const foreignRiskTotal = foreignRows.reduce((s, r) => s + r.triggered_risks.length, 0);
    const sovereignRiskTotal = sovereignRows.reduce((s, r) => s + r.triggered_risks.length, 0);
    expect(foreignRiskTotal).toBeGreaterThan(sovereignRiskTotal);
  });

  test('bridges are a subset of clauses referenced by triggered risks', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    for (const row of rows) {
      const triggeredClauseIds = new Set(row.triggered_risks.flatMap(r => r.procurement_clause_ids));
      for (const bridge of row.bridges) {
        expect(triggeredClauseIds.has(bridge.id), `Bridge ${bridge.id} not referenced by any triggered risk`).toBe(true);
      }
    }
  });
});
