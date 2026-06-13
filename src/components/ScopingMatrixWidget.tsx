import React, { useState } from 'react';
import { ScopingMatrix } from './ScopingMatrix';
import type { ControlProfile } from '../../shared/src/schema';

function loadProfile(id: string): Partial<ControlProfile> | undefined {
  try {
    const raw = localStorage.getItem(`csi:${id}:profile`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function ScopingMatrixWidget({ assessmentId }: { assessmentId: string }) {
  const [initial] = useState<Partial<ControlProfile> | undefined>(() => loadProfile(assessmentId));

  function handleChange(profile: ControlProfile) {
    localStorage.setItem(`csi:${assessmentId}:profile`, JSON.stringify(profile));
  }

  return <ScopingMatrix initialProfile={initial} onProfileChange={handleChange} />;
}
