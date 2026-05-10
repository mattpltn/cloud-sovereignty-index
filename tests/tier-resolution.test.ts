import { describe, it, expect } from 'vitest';
import { resolvePlaceholders, effectiveTier, isBlocAutoSatisfied } from '@shared/tier-resolution';
import type { Country } from '@shared/schema';

const de: Country = {
  code: 'DE',
  name: 'Germany',
  adj: 'German',
  national_admin_label: 'German federal administration',
  emergency_regime: 'Verteidigungsfall (Basic Law Article 115a)',
};

const ug: Country = {
  code: 'UG',
  name: 'Uganda',
  adj: 'Ugandan',
  national_admin_label: 'Ugandan Government',
  emergency_regime: 'state of emergency (Constitution Article 110)',
};

describe('resolvePlaceholders', () => {
  it('EU-CSF variant resolves {{BLOC}} to EU', () => {
    const text = 'CSP operates under {{BLOC}} jurisdiction';
    expect(resolvePlaceholders(text, { variant: 'EU-CSF', country: de })).toBe(
      'CSP operates under EU jurisdiction'
    );
  });

  it('Generalized variant resolves {{BLOC}} to country name', () => {
    const text = 'CSP operates under {{BLOC}} jurisdiction';
    expect(resolvePlaceholders(text, { variant: 'Generalized', country: ug })).toBe(
      'CSP operates under Uganda jurisdiction'
    );
  });

  it('resolves {{COUNTRY}} to country name', () => {
    expect(resolvePlaceholders('Head office in {{COUNTRY}}', { variant: 'EU-CSF', country: de })).toBe(
      'Head office in Germany'
    );
  });

  it('resolves {{NATIONAL_ADMIN}}', () => {
    expect(resolvePlaceholders('Access by {{NATIONAL_ADMIN}}', { variant: 'EU-CSF', country: de })).toBe(
      'Access by German federal administration'
    );
  });

  it('resolves {{EMERGENCY_REGIME}}', () => {
    expect(resolvePlaceholders('Under {{EMERGENCY_REGIME}}', { variant: 'EU-CSF', country: de })).toBe(
      'Under Verteidigungsfall (Basic Law Article 115a)'
    );
  });

  it('falls back to — when no country provided', () => {
    expect(resolvePlaceholders('In {{COUNTRY}} or {{NATIONAL_ADMIN}}', { variant: 'EU-CSF' })).toBe(
      'In — or —'
    );
  });

  it('all tokens resolved in one pass', () => {
    const text = '{{BLOC}} / {{COUNTRY}} / {{NATIONAL_ADMIN}} / {{EMERGENCY_REGIME}}';
    const out = resolvePlaceholders(text, { variant: 'Generalized', country: ug });
    expect(out).toBe('Uganda / Uganda / Ugandan Government / state of emergency (Constitution Article 110)');
  });
});

describe('effectiveTier', () => {
  it('single question always returns single', () => {
    expect(effectiveTier('single', false, { variant: 'EU-CSF' })).toBe('single');
    expect(effectiveTier('single', true, { variant: 'EU-CSF', country: de })).toBe('single');
  });

  it('tiered without country → bloc', () => {
    expect(effectiveTier('tiered', true, { variant: 'EU-CSF' })).toBe('bloc');
  });

  it('tiered with country and national available → national', () => {
    expect(effectiveTier('tiered', true, { variant: 'EU-CSF', country: de })).toBe('national');
  });

  it('tiered without national tier → bloc even with country', () => {
    expect(effectiveTier('tiered', false, { variant: 'EU-CSF', country: de })).toBe('bloc');
  });

  it('nationalAnsweredYes → null (auto-satisfied)', () => {
    expect(effectiveTier('tiered', true, { variant: 'EU-CSF', country: de, nationalAnsweredYes: true })).toBeNull();
  });
});

describe('isBlocAutoSatisfied', () => {
  it('yes → true', () => expect(isBlocAutoSatisfied('yes')).toBe(true));
  it('no → false', () => expect(isBlocAutoSatisfied('no')).toBe(false));
  it('partial → false', () => expect(isBlocAutoSatisfied('partial')).toBe(false));
  it('n/a → false', () => expect(isBlocAutoSatisfied('n/a')).toBe(false));
});
