// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import DomainRadar, { radarPoints, type RadarDomain } from '../src/components/DomainRadar';

const DOMAINS: RadarDomain[] = Array.from({ length: 8 }, (_, i) => ({
  id: `SOV-${i + 1}`, title: `Domain ${i + 1}`, csl: i % 4, answered: i !== 3,
}));

describe('DomainRadar renders (regression: stale MAX_CSL ReferenceError blanked the result page)', () => {
  test('renders an <svg> for both variants without throwing', () => {
    for (const maxCsl of [3, 4]) {
      const { container } = render(<DomainRadar domains={DOMAINS} globalCsl={2} maxCsl={maxCsl} />);
      const svg = container.querySelector('svg');
      expect(svg, `svg should render for maxCsl=${maxCsl}`).not.toBeNull();
      // maxCsl concentric rings + the value polygon are present
      expect(container.querySelectorAll('polygon').length).toBe(maxCsl + 1);
    }
  });

  test('renders nothing below 3 axes', () => {
    const { container } = render(<DomainRadar domains={DOMAINS.slice(0, 2)} globalCsl={1} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  test('radarPoints first axis is at 12 o\'clock', () => {
    const [[x, y]] = radarPoints([1, 1, 1, 1], 100, 100, 50);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(50, 5);
  });
});
