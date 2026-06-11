import { describe, it, expect } from 'vitest';
import { controlGatePassesAtLevel } from '@shared/scoring';

const ans = (m: Record<string, boolean>) => (id: string) => m[id] === true;

describe('CADA third-country-control gradient (Annex II g-criteria + Art. 18)', () => {
  it('EU-controlled provider passes the control gate at every level', () => {
    const yes = ans({ 'SOV-1-03': true });
    expect(controlGatePassesAtLevel(2, yes)).toBe(true);
    expect(controlGatePassesAtLevel(3, yes)).toBe(true);
    expect(controlGatePassesAtLevel(4, yes)).toBe(true);
  });

  it('third-country-controlled provider with full safeguards passes UAL2 but not UAL3/4', () => {
    const yes = ans({ 'SOV-2-05': true, 'SOV-2-07-CADA': true });
    expect(controlGatePassesAtLevel(2, yes)).toBe(true);
    expect(controlGatePassesAtLevel(3, yes)).toBe(false); // no derogation listing
    expect(controlGatePassesAtLevel(4, yes)).toBe(false);
  });

  it('derogation + safeguards + code access passes UAL3, never UAL4', () => {
    const yes = ans({
      'SOV-2-05': true, 'SOV-2-07-CADA': true,
      'SOV-1-10-CADA': true, 'SOV-6-07-CADA': true,
    });
    expect(controlGatePassesAtLevel(3, yes)).toBe(true);
    expect(controlGatePassesAtLevel(4, yes)).toBe(false);
  });

  it('derogation without code access fails UAL3 (L3(g)(i) final sentence)', () => {
    const yes = ans({ 'SOV-2-05': true, 'SOV-2-07-CADA': true, 'SOV-1-10-CADA': true });
    expect(controlGatePassesAtLevel(3, yes)).toBe(false);
  });
});
