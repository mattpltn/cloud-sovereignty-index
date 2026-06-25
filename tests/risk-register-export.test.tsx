// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import RiskRegisterExport, { type RegisterRow } from '../src/components/RiskRegisterExport';

const rows: RegisterRow[] = [
  { owner: 'supplier', kind: 'clause', group: 'L1 · Facility', id: 'PC-L1-AUDIT', title: 'Facility audit', severity: null, fullText: 'The Customer shall have the right to audit…', basis: 'dora — Art. 30(3)', expected: '', action: 'Insert this clause into the contract.' },
  { owner: 'internal', kind: 'gap', group: 'Technology Sovereignty', objectiveId: 'SOV-6', id: 'SOV-6-14-CSI', title: 'Self-operation capability', severity: 1, fullText: 'Can you demonstrate in-house capability…', basis: 'CSI', expected: 'Runbook + cross-trained engineers', action: 'Implement and document this control.' },
];

describe('RiskRegisterExport', () => {
  test('renders export controls with per-owner counts', () => {
    const { container } = render(<RiskRegisterExport rows={rows} assessmentId="abcd1234-0000" />);
    const text = container.textContent ?? '';
    expect(text).toContain('Risk register:');
    expect(text).toMatch(/XLSX/);
    expect(text).toMatch(/CSV/);
    expect(text).toContain('1 provider · 1 internal'); // counts split by owner
  });

  test('renders nothing for an empty register', () => {
    const { container } = render(<RiskRegisterExport rows={[]} assessmentId="x" />);
    expect(container.textContent).toBe('');
  });
});
