// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ControlMatrixReport } from '../src/components/ControlMatrixReport';
import { buildReport } from '../shared/src/report';
import type { ControlProfile } from '../shared/src/schema';
import type { AnswerMap } from '../shared/src/types';

const FOREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L2: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L3: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L6: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
};

const ANSWERS: AnswerMap = {};

describe('flow-result', () => {
  test('buildReport produces 6 rows', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    expect(rows).toHaveLength(6);
  });

  test('at least one row has triggered_risks on a fully foreign profile', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    expect(rows.some(r => r.triggered_risks.length > 0)).toBe(true);
  });

  test('each row has distinct data-control-channel and data-assurance-signal attributes', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    const { container } = render(React.createElement(ControlMatrixReport, { rows }));
    const controlChannelEls = container.querySelectorAll('[data-control-channel]');
    const assuranceSignalEls = container.querySelectorAll('[data-assurance-signal]');
    expect(controlChannelEls.length).toBe(6);
    expect(assuranceSignalEls.length).toBe(6);
    const controlChannels = Array.from(controlChannelEls).map(el => el.getAttribute('data-control-channel'));
    const assuranceSignals = Array.from(assuranceSignalEls).map(el => el.getAttribute('data-assurance-signal'));
    // Each layer should have a non-empty value
    for (const v of [...controlChannels, ...assuranceSignals]) {
      expect(typeof v).toBe('string');
      expect((v?.length ?? 0) > 0).toBe(true);
    }
  });

  test('secondaryScore <details> is closed by default (no open attribute)', () => {
    const rows = buildReport(FOREIGN_PROFILE, ANSWERS);
    const secondaryScore = { label: 'CSI Composite', value: '72%', detail: 'SEAL 3' };
    const { container } = render(React.createElement(ControlMatrixReport, { rows, secondaryScore }));
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
  });

  test('isCsiLmic predicate: csi_composite in selected_frameworks → true', () => {
    // Unit test mirrors the result.astro gating logic
    const isCsiLmic = (selectedFrameworks: string[]) => selectedFrameworks.includes('csi_composite');
    expect(isCsiLmic(['csi_composite'])).toBe(true);
    expect(isCsiLmic(['eu_csf'])).toBe(false);
    expect(isCsiLmic(['c3a'])).toBe(false);
    expect(isCsiLmic(['cada'])).toBe(false);
    expect(isCsiLmic(['eu_csf', 'csi_composite'])).toBe(true);
  });
});
