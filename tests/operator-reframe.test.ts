import { describe, test, expect } from 'vitest';
import { deriveOperatorLabel, operatorForLayer, reframeOperator } from '../shared/src/tier-resolution';
import { deriveControlProfile, togglesFromDefaults } from '../shared/src/scoping-derive';

const SAMPLE = "The cloud service provider MUST ensure redundant connectivity. When using third-party software under the cloud service provider's responsibility, the cloud service provider MUST act.";

describe('operator reframe (frame on the fine value)', () => {
  test('self-operated (colocation) → "your organisation"', () => {
    const label = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('colocation')));
    const out = reframeOperator(SAMPLE, label);
    expect(out).toContain('Your organisation MUST ensure redundant connectivity');
    expect(out).toContain("under your organisation's responsibility");
    expect(out).not.toMatch(/cloud service provider/);
  });

  test('own datacenter → "your organisation"', () => {
    const label = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('own_datacenter')));
    expect(label.subject).toBe('your organisation');
  });

  test('hyperscaler → unchanged (provider operates)', () => {
    const label = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('hyperscaler')));
    expect(reframeOperator(SAMPLE, label)).toBe(SAMPLE);
  });

  test('managed service → "your cloud operator"', () => {
    const label = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('managed_service')));
    expect(label.subject).toBe('your cloud operator');
    expect(reframeOperator('the cloud service provider MUST', label)).toBe('your cloud operator MUST');
  });

  test('no profile → defaults to provider (no change)', () => {
    expect(reframeOperator(SAMPLE, deriveOperatorLabel(undefined))).toBe(SAMPLE);
  });

  // Bare "the provider" is only re-aimed when includeBareProvider is set (layer-anchored
  // questions). Off by default so unanchored provider-relationship questions are untouched.
  describe('bare "the provider" reframe (Fix #1, anchored questions only)', () => {
    const vendor = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('managed_service')));
    const BARE = "Does the provider ensure personnel are cleared? The provider's staff and the provider must comply.";

    test('default (unanchored): bare "the provider" left unchanged', () => {
      expect(reframeOperator(BARE, vendor)).toBe(BARE);
    });

    test('includeBareProvider (anchored): rewrites "the provider" to the operator', () => {
      const out = reframeOperator(BARE, vendor, { includeBareProvider: true });
      expect(out).toBe('Does your cloud operator ensure personnel are cleared? Your cloud operator\'s staff and your cloud operator must comply.');
      expect(out).not.toMatch(/\bthe provider\b/i);
    });

    test('includeBareProvider is still a no-op when the operator is a provider', () => {
      const provider = deriveOperatorLabel(deriveControlProfile(togglesFromDefaults('hyperscaler')));
      expect(reframeOperator(BARE, provider, { includeBareProvider: true })).toBe(BARE);
    });
  });

  // Facility (L1) questions address whoever runs the building, even when the customer
  // runs the cloud on top — so SOV-8 in colocation → the data-center provider.
  describe('operatorForLayer (facility vs cloud)', () => {
    const colo = deriveControlProfile(togglesFromDefaults('colocation'));
    const ownDc = deriveControlProfile(togglesFromDefaults('own_datacenter'));

    test('L1 facility in colocation → the data center provider', () => {
      expect(operatorForLayer(colo, 'L1').subject).toBe('the data center provider');
    });
    test('L1 facility in own datacenter → your organisation', () => {
      expect(operatorForLayer(ownDc, 'L1').subject).toBe('your organisation');
    });
    test('L1 facility in a public CSP (full provider stack) → the cloud service provider', () => {
      const hyper = deriveControlProfile(togglesFromDefaults('hyperscaler'));
      expect(operatorForLayer(hyper, 'L1').subject).toBe('the cloud service provider');
    });
    test('L3 cloud layer in colocation (self-operated) → your organisation', () => {
      expect(operatorForLayer(colo, 'L3').subject).toBe('your organisation');
    });
    test('L3 cloud layer in hyperscaler → the cloud service provider', () => {
      const hyper = deriveControlProfile(togglesFromDefaults('hyperscaler'));
      expect(operatorForLayer(hyper, 'L3').subject).toBe('the cloud service provider');
    });
  });
});
