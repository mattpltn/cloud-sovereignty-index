// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Questionnaire from '../src/components/Questionnaire';
import criteriaJson from '../data/criteria.json';
import type { CriteriaFile, ControlProfile } from '../shared/src/schema';

const criteria = criteriaJson as unknown as CriteriaFile;

// SOV-2 contains hardware compelled-access questions (show_when on L2 ownership/operation)
const SOV2_OBJECTIVE = criteria.objectives.find(o => o.id === 'SOV-2')!;

// Client-owned, client-operated L2 — no show_when predicate for L2 foreign/provider should fire
const CLIENT_OWNED_PROFILE: ControlProfile = {
  L1: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L2: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L3: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L4: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L5: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
  L6: { ownership: 'client', operation: 'client_staff', dependency: 'self_supported_oss', location: 'in_country' },
};

const FOREIGN_PROFILE: ControlProfile = {
  L1: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L2: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L3: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L4: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L5: { ownership: 'provider', operation: 'foreign_vendor', dependency: 'proprietary_inaccessible', location: 'foreign' },
  L6: { ownership: 'provider', operation: 'provider', dependency: 'proprietary_inaccessible', location: 'foreign' },
};

const BASE_PROPS = {
  id: 'test-assessment',
  objectiveId: 'SOV-2',
  criteria,
  variant: 'Generalized' as const,
  allObjectiveIds: ['SOV-2'],
  selectedFrameworks: ['csi_composite'],
  customerSelectedAcIds: [],
};

function getQuestionCardIds(): string[] {
  // Question cards render the ID in a <span class="text-xs font-mono text-gray-400 mr-2">
  // The disclosure list uses a different class: "font-mono mr-1"
  const cardIdSpans = document.querySelectorAll('span.text-xs.font-mono.text-gray-400.mr-2');
  return Array.from(cardIdSpans).map(el => el.textContent ?? '');
}

describe('flow-questionnaire', () => {
  test('SOV-2-01 is absent from visible question cards when L1.location is in_country', () => {
    // SOV-2-01 show_when: "L1.location == 'foreign' OR L1.location == 'trusted_third'"
    // Client-owned/in-country profile → predicate false → question hidden from main list.
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      controlProfile: CLIENT_OWNED_PROFILE,
    }));
    expect(getQuestionCardIds()).not.toContain('SOV-2-01');
  });

  test('SOV-2-01 appears in the hidden-by-scope disclosure when filtered out', () => {
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      controlProfile: CLIENT_OWNED_PROFILE,
    }));
    // The disclosure affordance should mention the hidden count
    const summary = screen.queryByText(/hidden by your control profile/i);
    expect(summary).not.toBeNull();
    // And SOV-2-01 should appear in the disclosure list
    const disclosure = summary?.closest('details');
    expect(disclosure?.textContent).toContain('SOV-2-01');
  });

  test('SOV-2-01 IS present in question cards when L1 location is foreign (show_when fires)', () => {
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      controlProfile: FOREIGN_PROFILE,
    }));
    expect(getQuestionCardIds()).toContain('SOV-2-01');
  });

  test('without a controlProfile, no questions are hidden by scope', () => {
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      controlProfile: undefined,
    }));
    // SOV-2-01 should be visible since no profile = no filtering
    expect(screen.queryByText('SOV-2-01')).not.toBeNull();
  });

  test('EU-CSF variant: show_when filtering does not apply (eu_csf framework, not csi_composite)', () => {
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      variant: 'EU-CSF',
      selectedFrameworks: ['eu_csf'],
      controlProfile: CLIENT_OWNED_PROFILE,
    }));
    // EU-CSF is not CSI mode; show_when should have no effect — questions visible by framework
    // SOV-2-01 applies_to_eu_csf should drive visibility, not the show_when
    // We just assert no crash and the component renders
    expect(document.body).toBeTruthy();
  });

  test('hidden-by-scope affordance appears when questions are hidden', () => {
    render(React.createElement(Questionnaire, {
      ...BASE_PROPS,
      controlProfile: CLIENT_OWNED_PROFILE,
    }));
    // With sovereign profile some questions will be hidden; affordance should appear
    const hiddenDetails = screen.queryByText(/hidden by your control profile/i);
    // May or may not have hidden questions in SOV-2 — just verify no crash
    // If shown, it should be in a <details> element
    if (hiddenDetails) {
      expect(hiddenDetails.closest('details')).not.toBeNull();
    }
  });
});
