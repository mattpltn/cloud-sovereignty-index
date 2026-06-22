// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ActionTracks, { type ActionItem } from '../src/components/ActionTracks';

const items: ActionItem[] = [
  { id: 'PC-L1-AUDIT', label: 'Facility audit & exit cooperation', owner: 'supplier', kind: 'clause', layer: 'L1 · Facility' },
  { id: 'SOV-3-01', label: 'Data residency', owner: 'supplier', kind: 'gap', severity: 0 },
  { id: 'SOV-6-14-CSI', label: 'Self-operation capability', owner: 'internal', kind: 'gap', severity: 1 },
];

describe('ActionTracks', () => {
  test('renders both tracks and places items under the correct owner', () => {
    const { container } = render(<ActionTracks items={items} levelLabel="CSL" />);
    const text = container.textContent ?? '';
    expect(text).toContain('Require from your provider');
    expect(text).toContain('Build & operate internally');
    expect(text).toContain('PC-L1-AUDIT');     // supplier clause surfaced
    expect(text).toContain('SOV-6-14-CSI');     // internal gap surfaced
  });

  test('renders nothing when there are no items', () => {
    const { container } = render(<ActionTracks items={[]} />);
    expect(container.textContent).toBe('');
  });
});
