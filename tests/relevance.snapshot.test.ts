import { describe, test, expect } from 'vitest';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile } from '../shared/src/schema';
import {
  deriveControlProfile, togglesFromDefaults, type ToggleProfile,
} from '../shared/src/scoping-derive';
import { firesOn, computeCoverage, type QuestionLike } from '../shared/src/coverage';

const criteria = criteriaJson as unknown as CriteriaFile;
const questions = criteria.objectives.flatMap(o => o.questions) as unknown as QuestionLike[];
const byId = (id: string) => questions.find(q => q.id === id)!;

const profileOf = (s: Parameters<typeof togglesFromDefaults>[0]): ControlProfile =>
  deriveControlProfile(togglesFromDefaults(s));

// own-datacenter on a licensed commercial platform (the VMware case): client owns and
// operates L3, but the software is licensed — reversibility must still fire.
function vmwareProfile(): ControlProfile {
  const tp: ToggleProfile = togglesFromDefaults('own_datacenter');
  tp.L3 = { owned: 'client', operated: 'client', supported: '3p', support_nature: 'licensed_supported', location: 'in_country' };
  return deriveControlProfile(tp);
}

const visible = (id: string, p: ControlProfile) => firesOn(byId(id), p);

const cellStatus = (scenario: string, layer: string, archetype: string) => {
  const cells = computeCoverage(questions);
  return cells.find(c => c.scenario === scenario && c.layer === layer && c.archetype === archetype)?.status;
};

// These are the DESIRED end-state assertions. Before the re-tag (§5) several are RED
// on purpose — they are the acceptance gate the rewrite must turn green.
describe('relevance.snapshot — golden cases (Cookbook §6b)', () => {
  test('colocation: provider-residency questions vanish (client owns the data layers)', () => {
    const colo = profileOf('colocation');
    expect(visible('SOV-3-01-C2', colo), 'SOV-3-01-C2 must be hidden in colocation').toBe(false);
    expect(visible('SOV-3-01-C5', colo), 'SOV-3-01-C5 must be hidden in colocation').toBe(false);
  });

  test('colocation: the landlord physical-custody surface is covered at L1', () => {
    expect(cellStatus('colocation', 'L1', 'PHYSICAL_CUSTODY')).toBe('covered');
  });

  test('own-DC on VMware: self-remediation & continuity show; OSS-only dev-tools question hides', () => {
    const vm = vmwareProfile();
    expect(visible('SOV-6-01', vm), 'SOV-6-01 (source/self-remediation) must show on licensed platform').toBe(true);
    expect(visible('SOV-6-02', vm), 'SOV-6-02 (vendor-disruption continuity) must be retained').toBe(true);
    expect(visible('SOV-6-03', vm), 'SOV-6-03 (OSS dev-tools) must hide on a licensed platform').toBe(false);
  });

  test('hyperscaler: operating-personnel question is no longer dead', () => {
    const hyper = profileOf('hyperscaler');
    expect(visible('SOV-4-01', hyper), 'SOV-4-01 must show when a provider operates L5').toBe(true);
  });

  test('own-datacenter (OSS): a self-sufficiency verification surface is covered', () => {
    // own-DC is the most sovereign scenario; its only risk surface is verification.
    const l3 = cellStatus('own_datacenter', 'L3', 'SELF_SUFFICIENCY');
    const l4 = cellStatus('own_datacenter', 'L4', 'SELF_SUFFICIENCY');
    expect([l3, l4].some(s => s === 'covered'), 'own-DC needs ≥1 SELF_SUFFICIENCY question').toBe(true);
  });
});
