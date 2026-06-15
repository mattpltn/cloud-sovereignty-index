// @vitest-environment jsdom
import { describe, test, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopingFlow } from '../src/components/ScopingFlow';
import { togglesFromDefaults, deriveControlProfile } from '../shared/src/scoping-derive';

// Stub fetch so PATCH calls don't fail in jsdom
beforeAll(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('ScopingFlow', () => {
  test('renders 6 scenario cards on step 1', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-123' }));
    const cards = screen.getAllByRole('button');
    // 6 scenario buttons
    expect(cards.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText('Global cloud provider')).toBeTruthy();
    expect(screen.getByText('Our own datacenter, self-run')).toBeTruthy();
    expect(screen.getByText('Mixed / not sure')).toBeTruthy();
  });

  test('clicking hyperscaler shows refine table with 3p defaults for L1–L5', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-456' }));
    fireEvent.click(screen.getByText('Global cloud provider'));

    // Should be on step 2 — refine table
    expect(screen.getByText('Confirm your control profile')).toBeTruthy();

    // L1 through L5 owned=3p, L6 owned=client — verify notes heading is present
    expect(screen.getByText(/Pre-filled for/)).toBeTruthy();

    // "Review & confirm" button should be present
    expect(screen.getByText('Review & confirm →')).toBeTruthy();
  });

  test('refine table back button returns to scenario picker', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-789' }));
    fireEvent.click(screen.getByText('Global cloud provider'));
    fireEvent.click(screen.getByText('← Change scenario'));
    expect(screen.getByText('What best describes your cloud setup?')).toBeTruthy();
  });

  test('clicking mixed goes to advanced drag-grid', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-mix' }));
    fireEvent.click(screen.getByText('Mixed / not sure'));
    expect(screen.getByText('Advanced control matrix')).toBeTruthy();
  });

  test('advanced back button returns to scenario picker', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-back' }));
    fireEvent.click(screen.getByText('Mixed / not sure'));
    fireEvent.click(screen.getByText('← Back to scenarios'));
    expect(screen.getByText('What best describes your cloud setup?')).toBeTruthy();
  });

  test('hyperscaler refine → continue shows readback with confirm button', () => {
    render(React.createElement(ScopingFlow, { assessmentId: 'test-readback' }));
    fireEvent.click(screen.getByText('Global cloud provider'));
    fireEvent.click(screen.getByText('Review & confirm →'));
    expect(screen.getByText('Confirm & start assessment →')).toBeTruthy();
    expect(screen.getByText('← Edit profile')).toBeTruthy();
  });

  test('deriveControlProfile for hyperscaler: L1 landlord, L2–L5 provider, L6 client', () => {
    const tp = togglesFromDefaults('hyperscaler');
    const profile = deriveControlProfile(tp);
    // L1 facility is a custodian/landlord (§2); L2–L5 are provider services.
    expect(profile.L1.ownership).toBe('commercial_lessor');
    for (const layer of ['L2', 'L3', 'L4', 'L5'] as const) {
      expect(profile[layer].ownership).toBe('provider');
    }
    expect(profile.L6.ownership).toBe('client');
  });

  test('deriveControlProfile for own_datacenter: all client', () => {
    const tp = togglesFromDefaults('own_datacenter');
    const profile = deriveControlProfile(tp);
    for (const layer of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const) {
      expect(profile[layer].ownership).toBe('client');
      expect(profile[layer].operation).toBe('client_staff');
    }
  });
});
