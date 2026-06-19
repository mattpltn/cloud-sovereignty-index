import React from 'react';
import type { Risk } from '../../shared/src/report';

/**
 * Read-only card for a triggered structural risk. Used both in the results-page
 * ControlMatrixReport and inline in the questionnaire (with `locked`) where a
 * scope-hidden question's structural risk must still be surfaced — never silently
 * dropped.
 */
export default function RiskCard({ risk, locked = false }: { risk: Risk; locked?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${locked ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-gray-800">{risk.title}</span>
        <span className="text-xs text-gray-400 shrink-0 font-mono">{risk.id}</span>
      </div>
      {locked && (
        <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
          Structural finding · score locked
        </span>
      )}
      <p className="text-sm text-gray-600 mt-1">{risk.description}</p>
      {locked && (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{risk.severity_basis}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {risk.source_anchors.map((a, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
            {a.register_key}: {a.clause}
          </span>
        ))}
      </div>
    </div>
  );
}
