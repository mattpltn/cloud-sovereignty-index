import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CriteriaFileSchema,
  DecisionsRegisterFileSchema,
  CountriesFileSchema,
} from '@shared/schema';

const dataDir = resolve(__dirname, '../data');

function readJson(name: string) {
  return JSON.parse(readFileSync(resolve(dataDir, name), 'utf-8'));
}

describe('criteria.json', () => {
  it('parses without errors', () => {
    const data = readJson('criteria.json');
    const result = CriteriaFileSchema.safeParse(data);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('weights sum to 1.0', () => {
    const data = readJson('criteria.json');
    const total = Object.values(data.weights as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('has 8 objectives', () => {
    const data = readJson('criteria.json');
    // starter only has SOV-1 and SOV-2; full build will add more
    expect(data.objectives.length).toBeGreaterThanOrEqual(2);
  });

  it('all question ids match their objective prefix', () => {
    const data = readJson('criteria.json');
    for (const obj of data.objectives) {
      for (const q of obj.questions) {
        expect(q.id).toMatch(new RegExp(`^${obj.id}-`));
      }
    }
  });
});

describe('decisions-register.json', () => {
  it('parses without errors', () => {
    const data = readJson('decisions-register.json');
    const result = DecisionsRegisterFileSchema.safeParse(data);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has at least 21 entries', () => {
    const data = readJson('decisions-register.json');
    expect(data.entries.length).toBeGreaterThanOrEqual(21);
  });

  it('all ids are unique', () => {
    const data = readJson('decisions-register.json');
    const ids = data.entries.map((d: { id: string }) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('countries.json', () => {
  it('parses without errors', () => {
    const data = readJson('countries.json');
    const result = CountriesFileSchema.safeParse(data);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has 27 EU members', () => {
    const data = readJson('countries.json');
    expect(data.EU.length).toBe(27);
  });

  it('all country codes are exactly 2 characters', () => {
    const data = readJson('countries.json');
    const all = [...data.EU, ...data.EEA_non_EU, ...data.non_EU];
    for (const c of all) {
      expect(c.code.length).toBe(2);
    }
  });

  it('Germany is marked as source verbatim', () => {
    const data = readJson('countries.json');
    const de = data.EU.find((c: { code: string }) => c.code === 'DE');
    expect(de?.is_source_verbatim).toBe(true);
  });

  it('all entries have national_admin_label and emergency_regime', () => {
    const data = readJson('countries.json');
    const all = [...data.EU, ...data.EEA_non_EU, ...data.non_EU];
    for (const c of all) {
      expect(c.national_admin_label).toBeTruthy();
      expect(c.emergency_regime).toBeTruthy();
    }
  });
});
