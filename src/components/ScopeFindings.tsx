import { useEffect, useState } from 'react';
import type { CriteriaFile, ControlProfile } from '../../shared/src/schema';
import type { Risk } from '../../shared/src/report';
import { unaskedFiredRisks } from '../../shared/src/report';
import RiskCard from './RiskCard';

/**
 * Pre-submit consolidation of structural findings the questionnaire never asks about.
 *
 * Some scope-determined facets (e.g. a foreign jurisdiction with no local presence)
 * make a cluster of questions structurally NO. Those questions are suppressed from the
 * flow (Questionnaire's quiet hidden-count disclosure) rather than asked. Any structural
 * RISK they carry must still be recorded — never silently dropped. This island surfaces
 * those risks ONCE, deduped and objective-independent (unaskedFiredRisks), right before
 * submit. Renders nothing when the scope carries no unasked structural risk.
 */
export default function ScopeFindings({ id, criteria }: { id: string; criteria: CriteriaFile }) {
  const [findings, setFindings] = useState<Risk[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let profile: ControlProfile | null = null;
      try {
        const raw = localStorage.getItem(`csi:${id}:profile`);
        if (raw) profile = JSON.parse(raw) as ControlProfile;
      } catch { /* ignore malformed cache */ }
      if (!profile) {
        try {
          const res = await fetch(`/api/assessments/${id}`);
          if (res.ok) {
            const rec = await res.json() as Record<string, unknown>;
            const cp = rec.control_profile;
            if (cp) profile = (typeof cp === 'string' ? JSON.parse(cp) : cp) as ControlProfile;
          }
        } catch { /* offline / workers unavailable */ }
      }
      if (cancelled) return;
      setFindings(profile ? unaskedFiredRisks(profile, criteria) : []);
    }
    load();
    return () => { cancelled = true; };
  }, [id, criteria]);

  if (!findings || findings.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Structural findings from your scope</h2>
      <p className="text-xs text-gray-500 mb-3">
        Your declared infrastructure carries {findings.length} structural risk{findings.length !== 1 ? 's' : ''} that
        no answer can change, so they were recorded as findings rather than asked as questions.
        They are included in your assessment.
      </p>
      <div className="space-y-2">
        {findings.map(risk => (
          <RiskCard key={risk.id} risk={risk} locked />
        ))}
      </div>
    </section>
  );
}
