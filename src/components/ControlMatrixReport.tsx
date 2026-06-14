import React, { useState } from 'react';
import type { LayerReportRow, ControlChannel, AssuranceSignal } from '../../shared/src/report';

// ── Channel display maps ──────────────────────────────────────────────────────

const CONTROL_BG: Record<ControlChannel, string> = {
  client: 'bg-green-50 text-green-900',
  commercial: 'bg-amber-50 text-amber-900',
  foreign_vendor: 'bg-orange-50 text-orange-900',
  foreign_provider: 'bg-red-50 text-red-900',
};

const CONTROL_LABEL: Record<ControlChannel, string> = {
  client: 'Client',
  commercial: 'Commercial',
  foreign_vendor: 'Foreign vendor',
  foreign_provider: 'Foreign provider',
};

const ASSURANCE_DOTS: Record<AssuranceSignal, string> = {
  strong: '●●●',
  adequate: '●●○',
  weak: '●○○',
  unknown: '○○○',
};

const ASSURANCE_LABEL: Record<AssuranceSignal, string> = {
  strong: 'Strong',
  adequate: 'Adequate',
  weak: 'Weak',
  unknown: 'Unknown',
};

const ASSURANCE_COLOR: Record<AssuranceSignal, string> = {
  strong: 'text-green-700',
  adequate: 'text-amber-700',
  weak: 'text-orange-700',
  unknown: 'text-gray-400',
};

const REALISM_BADGE: Record<string, string> = {
  standard_market_term: 'bg-green-100 text-green-800',
  negotiable: 'bg-amber-100 text-amber-800',
  hard_ask: 'bg-red-100 text-red-800',
};

const REALISM_LABEL: Record<string, string> = {
  standard_market_term: 'Standard term',
  negotiable: 'Negotiable',
  hard_ask: 'Hard ask',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskCard({ risk }: { risk: LayerReportRow['triggered_risks'][0] }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-gray-800">{risk.title}</span>
        <span className="text-xs text-gray-400 shrink-0 font-mono">{risk.id}</span>
      </div>
      <p className="text-sm text-gray-600 mt-1">{risk.description}</p>
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

function BridgeCard({ clause }: { clause: LayerReportRow['bridges'][0] }) {
  const badgeCls = REALISM_BADGE[clause.realism_tag] ?? 'bg-gray-100 text-gray-700';
  const badgeLabel = REALISM_LABEL[clause.realism_tag] ?? clause.realism_tag;

  return (
    <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/40">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-gray-800 font-mono">{clause.id}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badgeCls}`}>
          {badgeLabel}
        </span>
      </div>
      <p className="text-sm text-gray-700 mt-1">{clause.clause_text}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {clause.source_anchors.map((a, i) => (
          <span key={i} className="text-xs text-gray-500 font-mono">
            {a.register_key}: {a.clause}
          </span>
        ))}
      </div>
    </div>
  );
}

function LayerAccordion({ row }: { row: LayerReportRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        {/* Control channel cell */}
        <td
          data-control-channel={row.control_channel}
          className={`rounded px-2 py-1 text-xs font-semibold w-32 text-center ${CONTROL_BG[row.control_channel]}`}
        >
          {CONTROL_LABEL[row.control_channel]}
        </td>

        {/* Assurance signal cell — always separate from control */}
        <td
          data-assurance-signal={row.assurance_signal}
          className={`text-sm font-mono w-12 text-center ${ASSURANCE_COLOR[row.assurance_signal]}`}
          title={`Assurance: ${ASSURANCE_LABEL[row.assurance_signal]}`}
        >
          {ASSURANCE_DOTS[row.assurance_signal]}
        </td>

        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-800">{row.layer} — {row.layer_name}</span>
          <p className="text-xs text-gray-500 truncate">{row.narrative}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {row.triggered_risks.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {row.triggered_risks.length} {row.triggered_risks.length === 1 ? 'risk' : 'risks'}
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-4 space-y-4 bg-white">
          <p className="text-sm text-gray-700">{row.narrative}</p>

          {row.triggered_risks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Triggered risks</h4>
              <div className="space-y-2">
                {row.triggered_risks.map(risk => <RiskCard key={risk.id} risk={risk} />)}
              </div>
            </div>
          )}

          {row.bridges.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Procurement bridges</h4>
              <div className="space-y-2">
                {row.bridges.map(clause => <BridgeCard key={clause.id} clause={clause} />)}
              </div>
            </div>
          )}

          {row.triggered_risks.length === 0 && (
            <p className="text-sm text-green-700 font-medium">No risks triggered for this layer given the current control profile.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  rows: LayerReportRow[];
  secondaryScore?: {
    label: string;
    value: string | number;
    detail?: string;
  };
}

export function ControlMatrixReport({ rows, secondaryScore }: Props) {
  return (
    <div className="space-y-6">
      {/* Legend — two channels named explicitly */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
        <div>
          <span className="font-semibold">Control (who holds it):</span>{' '}
          {Object.entries(CONTROL_LABEL).map(([k, v]) => (
            <span key={k} className={`inline-block px-2 py-0.5 rounded mr-1 font-medium ${CONTROL_BG[k as ControlChannel]}`}>{v}</span>
          ))}
        </div>
        <div>
          <span className="font-semibold">Assurance (how well it's run):</span>{' '}
          {(['strong', 'adequate', 'weak', 'unknown'] as AssuranceSignal[]).map(s => (
            <span key={s} className={`inline-block mr-2 font-mono ${ASSURANCE_COLOR[s]}`}>
              {ASSURANCE_DOTS[s]} {ASSURANCE_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {/* Control matrix rows */}
      <div className="space-y-2">
        {rows.map(row => <LayerAccordion key={row.layer} row={row} />)}
      </div>

      {/* Secondary score — collapsed by default, posture-first */}
      {secondaryScore && (
        <details className="border border-gray-200 rounded-lg overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm text-gray-500 hover:bg-gray-50 select-none">
            Comparative score — secondary to the posture assessment above
          </summary>
          <div className="border-t border-gray-200 px-4 py-4">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-gray-600">{secondaryScore.label}:</span>
              <span className="text-lg font-bold text-gray-800">{secondaryScore.value}</span>
            </div>
            {secondaryScore.detail && (
              <p className="text-xs text-gray-500 mt-1">{secondaryScore.detail}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
