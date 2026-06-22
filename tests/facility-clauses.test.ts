import { describe, it, expect } from 'vitest';
import { buildReport } from '@shared/report';
import type { ControlProfile } from '@shared/schema';

function profile(L1: ControlProfile['L1']): ControlProfile {
  const rest = { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' } as const;
  return { L1, L2: { ...rest }, L3: { ...rest }, L4: { ...rest }, L5: { ...rest }, L6: { ...rest } };
}

const l1Bridges = (p: ControlProfile) =>
  buildReport(p, {}).find(r => r.layer === 'L1')!.bridges.map(b => b.id);

describe('L1 facility recommendations are profile-correct', () => {
  it('hyperscaler-operated facility → audit/transparency clause, never "remove your hardware"', () => {
    const ids = l1Bridges(profile({ ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' }));
    expect(ids).toContain('PC-L1-AUDIT');
    expect(ids).not.toContain('PC-L1-ACCESS');
  });

  it('colocation (commercial lessor) → physical-access clause, not the audit clause', () => {
    const ids = l1Bridges(profile({ ownership: 'commercial_lessor', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' }));
    expect(ids).toContain('PC-L1-ACCESS');
    expect(ids).not.toContain('PC-L1-AUDIT');
  });
});
