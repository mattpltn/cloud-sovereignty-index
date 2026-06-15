import { describe, test, expect } from 'vitest';
import {
  deriveLayerControl,
  deriveControlProfile,
  togglesFromDefaults,
  layerHasThirdParty,
  type LayerToggles,
  type ScenarioId,
} from '../shared/src/scoping-derive';
import { ControlProfileSchema } from '../shared/src/schema';

const SCENARIOS: Exclude<ScenarioId, 'mixed'>[] = [
  'hyperscaler', 'regional_csp', 'colocation', 'own_datacenter', 'managed_service',
];

describe('scoping-derive', () => {
  // ── Hard derivation cases ──────────────────────────────────────────────────

  test('colo hard case: owned=3p + operated=client → commercial_lessor', () => {
    const result = deriveLayerControl({
      owned: '3p', operated: 'client', supported: 'client',
      location: 'in_country',
    });
    expect(result.ownership).toBe('commercial_lessor');
    expect(result.operation).toBe('client_staff');
    expect(result.dependency).toBe('self_supported_oss');
  });

  test('managed-on-own-hardware: owned=client + operated=3p + location=foreign → client + foreign_vendor', () => {
    const result = deriveLayerControl({
      owned: 'client', operated: '3p', supported: '3p',
      location: 'foreign', support_nature: 'licensed_supported',
    });
    expect(result.ownership).toBe('client');
    expect(result.operation).toBe('foreign_vendor');
    expect(result.dependency).toBe('licensed_supported');
  });

  test('facility (L1) + owned=3p → commercial_lessor regardless of who operates it (§2)', () => {
    // colocation L1: owned=3p, operated=3p — would be 'provider' anywhere else, but a
    // third-party facility is a landlord/custodian, not a cloud service operator.
    const operatedByThirdParty = deriveLayerControl({
      owned: '3p', operated: '3p', supported: '3p',
      location: 'in_country', support_nature: 'licensed_supported',
    }, 'L1');
    expect(operatedByThirdParty.ownership).toBe('commercial_lessor');
    // same toggles at a compute layer stay 'provider'
    const computeLayer = deriveLayerControl({
      owned: '3p', operated: '3p', supported: '3p',
      location: 'in_country', support_nature: 'licensed_supported',
    }, 'L3');
    expect(computeLayer.ownership).toBe('provider');
  });

  test('owned=3p + operated=3p → provider', () => {
    const result = deriveLayerControl({
      owned: '3p', operated: '3p', supported: '3p',
      location: 'foreign', support_nature: 'proprietary_inaccessible',
    });
    expect(result.ownership).toBe('provider');
    expect(result.operation).toBe('provider');
  });

  test('owned=3p + operated=3p + in-country → local_si for non-provider operation', () => {
    // When owned=3p + operated=3p → ownership=provider → operation=provider (not local_si)
    const result = deriveLayerControl({
      owned: '3p', operated: '3p', supported: '3p',
      location: 'in_country', support_nature: 'proprietary_inaccessible',
    });
    expect(result.ownership).toBe('provider');
    expect(result.operation).toBe('provider');
  });

  test('owned=client + operated=3p + in-country → local_si', () => {
    const result = deriveLayerControl({
      owned: 'client', operated: '3p', supported: 'client',
      location: 'in_country',
    });
    expect(result.ownership).toBe('client');
    expect(result.operation).toBe('local_si');
  });

  test('fully sovereign: all client → client + client_staff + self_supported_oss + in_country', () => {
    const result = deriveLayerControl({
      owned: 'client', operated: 'client', supported: 'client',
      location: 'in_country',
    });
    expect(result).toEqual({
      ownership: 'client', operation: 'client_staff',
      dependency: 'self_supported_oss', location: 'in_country',
    });
  });

  test('support_nature maps through correctly when supported=3p', () => {
    const cases: Array<[LayerToggles['support_nature'], string]> = [
      ['licensed_supported', 'licensed_supported'],
      ['licensed_no_support', 'licensed_no_support'],
      ['proprietary_inaccessible', 'proprietary_inaccessible'],
    ];
    for (const [sn, expected] of cases) {
      const r = deriveLayerControl({
        owned: '3p', operated: '3p', supported: '3p',
        location: 'foreign', support_nature: sn,
      });
      expect(r.dependency).toBe(expected);
    }
  });

  test('supported=3p with no support_nature defaults to proprietary_inaccessible', () => {
    const r = deriveLayerControl({
      owned: '3p', operated: '3p', supported: '3p', location: 'foreign',
    });
    expect(r.dependency).toBe('proprietary_inaccessible');
  });

  // ── Scenario defaults ──────────────────────────────────────────────────────

  test.each(SCENARIOS)('scenario %s produces a ControlProfileSchema-valid profile', (scenario) => {
    const tp = togglesFromDefaults(scenario);
    const profile = deriveControlProfile(tp);
    const result = ControlProfileSchema.safeParse(profile);
    expect(result.success, `scenario ${scenario} failed validation: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  });

  test('hyperscaler: L1 facility is a landlord, L2–L5 provider, L6 client', () => {
    const tp = togglesFromDefaults('hyperscaler');
    const profile = deriveControlProfile(tp);
    // L1 facility: third-party-owned → landlord/custodian, not a service operator (§2)
    expect(profile.L1.ownership).toBe('commercial_lessor');
    expect(profile.L2.ownership).toBe('provider');
    expect(profile.L6.ownership).toBe('client');
  });

  test('colocation: L1 commercial_lessor (3p-owned facility = landlord), L2 client', () => {
    const tp = togglesFromDefaults('colocation');
    const profile = deriveControlProfile(tp);
    expect(profile.L1.ownership).toBe('commercial_lessor'); // facility landlord (§2)
    expect(profile.L2.ownership).toBe('client');
  });

  test('colocation: L3 dependency is licensed_supported (OpenStack default)', () => {
    const tp = togglesFromDefaults('colocation');
    const profile = deriveControlProfile(tp);
    expect(profile.L3.dependency).toBe('licensed_supported');
    expect(profile.L3.ownership).toBe('client');
    expect(profile.L3.operation).toBe('client_staff');
  });

  test('own_datacenter: all layers client/client_staff/self_supported_oss', () => {
    const tp = togglesFromDefaults('own_datacenter');
    const profile = deriveControlProfile(tp);
    for (const layer of ['L1','L2','L3','L4','L5','L6'] as const) {
      expect(profile[layer].ownership).toBe('client');
      expect(profile[layer].operation).toBe('client_staff');
    }
  });

  test('managed_service: L2 owned=client + operated=3p → client + foreign_vendor (in_country → local_si)', () => {
    const tp = togglesFromDefaults('managed_service');
    const profile = deriveControlProfile(tp);
    // L2: owned=client, operated=3p, location=in_country → operation=local_si
    expect(profile.L2.ownership).toBe('client');
    expect(profile.L2.operation).toBe('local_si');
  });

  // ── layerHasThirdParty ─────────────────────────────────────────────────────

  test('layerHasThirdParty: all-client layer → false', () => {
    expect(layerHasThirdParty({
      ownership: 'client', operation: 'client_staff',
      dependency: 'self_supported_oss', location: 'in_country',
    })).toBe(false);
  });

  test('layerHasThirdParty: any 3p facet → true', () => {
    expect(layerHasThirdParty({
      ownership: 'provider', operation: 'client_staff',
      dependency: 'self_supported_oss', location: 'in_country',
    })).toBe(true);
    expect(layerHasThirdParty({
      ownership: 'client', operation: 'foreign_vendor',
      dependency: 'self_supported_oss', location: 'in_country',
    })).toBe(true);
    expect(layerHasThirdParty({
      ownership: 'client', operation: 'client_staff',
      dependency: 'licensed_supported', location: 'in_country',
    })).toBe(true);
  });
});
