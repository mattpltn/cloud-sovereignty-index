import type { AssessmentResult, EuCsfResult, C3aResult, CsiCompositeResult } from '../../shared/src/types';

interface Props {
  result: AssessmentResult;
}

const SEAL_NAMES = ['No Sovereignty', 'Jurisdictional Sovereignty', 'Data Sovereignty', 'Digital Resilience', 'Full Digital Sovereignty'];
const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

const CSI_MATURITY_NAMES = ['Foundational', 'Developing', 'Advanced', 'Pioneering'];
const CSI_MATURITY_COLORS = ['#dc2626', '#f97316', '#22c55e', '#16a34a'];

function EuCsfCard({ eu_csf, variant }: { eu_csf: EuCsfResult; variant: string }) {
  const seal = eu_csf.global.seal;
  const pct = eu_csf.global.pct;
  const color = SEAL_COLORS[seal] ?? '#6b7280';
  const label = SEAL_NAMES[seal] ?? `Level ${seal}`;
  const levelPrefix = 'SEAL';

  return (
    <div className="border border-gray-200 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">EU Cloud Sovereignty Framework</div>
      <div className="text-5xl font-bold tabular-nums mb-2" style={{ color }}>{Math.round(pct)}%</div>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium text-white mb-2"
        style={{ backgroundColor: color }}>
        {levelPrefix} {seal} — {label}
      </div>
      <p className="text-xs text-gray-500">
        Weakest-link gate: all level ≤{seal} criteria must be met. EU-CSF v1.2.1.
      </p>
    </div>
  );
}

function C3aCard({ c3a }: { c3a: C3aResult }) {
  const crit = c3a.criterion.global;
  const ac = c3a.additional_criterion.global;

  return (
    <div className="border border-gray-200 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">BSI C3A — Cloud Computing Autonomy</div>
      <div className="space-y-3">
        <div>
          <div className="text-3xl font-bold tabular-nums text-gray-900">{Math.round(crit.pct)}%</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Criterion — {crit.passed}/{crit.applicable} met (binary pass/fail)
          </div>
        </div>
        {ac ? (
          <div>
            <div className="text-3xl font-bold tabular-nums text-gray-900">{Math.round(ac.pct)}%</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Additional Criterion — {ac.passed}/{ac.applicable} met (customer-selected)
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">No Additional Criteria selected.</div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">C3A v1.0. No SEAL — pass/fail per criterion only.</p>
    </div>
  );
}

// Tier definitions: label, color, min%, max%, segment width as % of bar
const CSI_TIERS = [
  { label: 'Foundational', color: '#dc2626', min: 0,  max: 40,  w: 40 },
  { label: 'Developing',   color: '#f97316', min: 41, max: 70,  w: 30 },
  { label: 'Advanced',     color: '#22c55e', min: 71, max: 90,  w: 20 },
  { label: 'Pioneering',   color: '#16a34a', min: 91, max: 100, w: 10 },
];

function MaturityBar({ pct, csl }: { pct: number; csl: number }) {
  const rounded = Math.round(pct);
  return (
    <div className="mt-4">
      {/* Segmented bar */}
      <div className="relative flex h-5 rounded-full overflow-hidden">
        {CSI_TIERS.map((tier, i) => (
          <div
            key={i}
            className="transition-all"
            style={{
              width: `${tier.w}%`,
              backgroundColor: i === csl ? tier.color : '#e5e7eb',
              opacity: i > csl ? 0.4 : 1,
            }}
          />
        ))}
        {/* Score marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gray-900"
          style={{ left: `${Math.min(rounded, 99)}%` }}
        />
        {/* Score label on marker */}
        <div
          className="absolute -top-5 text-[10px] font-bold text-gray-800 -translate-x-1/2"
          style={{ left: `${Math.min(rounded, 99)}%` }}
        >
          {rounded}%
        </div>
      </div>
      {/* Tier labels below */}
      <div className="flex mt-1">
        {CSI_TIERS.map((tier, i) => (
          <div
            key={i}
            className="flex flex-col items-center"
            style={{ width: `${tier.w}%` }}
          >
            <span
              className="text-[9px] font-semibold leading-tight truncate px-0.5"
              style={{ color: i === csl ? tier.color : i < csl ? '#9ca3af' : '#d1d5db' }}
            >
              {tier.label}
            </span>
            <span className="text-[8px] text-gray-400 leading-tight">{tier.min}–{tier.max}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsiCard({ csi, variant }: { csi: CsiCompositeResult; variant: string }) {
  const isGeneralized = variant === 'Generalized';
  const csl = csi.global.csl;
  const pct = csi.global.pct;
  const pctToNext = csi.global.pct_to_next_tier;

  const color = isGeneralized ? (CSI_MATURITY_COLORS[csl] ?? '#6b7280') : (SEAL_COLORS[csl] ?? '#6b7280');
  const label = isGeneralized ? (CSI_MATURITY_NAMES[csl] ?? `Tier ${csl}`) : (SEAL_NAMES[csl] ?? `Level ${csl}`);

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">CSI Composite <span className="normal-case font-normal text-blue-400">(editorial)</span></div>
      <div className="text-5xl font-bold tabular-nums mb-2" style={{ color }}>{Math.round(pct)}%</div>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium text-white mb-3"
        style={{ backgroundColor: color }}>
        {isGeneralized ? label : `SEAL ${csl} — ${label}`}
      </div>
      {isGeneralized && <MaturityBar pct={pct} csl={csl} />}
      <p className="text-xs text-gray-500 mt-3">
        CSI editorial blend of EU-CSF + C3A. Not a source-standard certification.
      </p>
      {isGeneralized && pctToNext !== null && pctToNext > 0 && (
        <div className="mt-2 pt-2 border-t border-blue-200">
          <p className="text-xs font-medium text-blue-700">
            To reach {CSI_MATURITY_NAMES[csl + 1]}: {pctToNext}% more needed
          </p>
        </div>
      )}
      {isGeneralized && pctToNext === null && (
        <div className="mt-2 pt-2 border-t border-blue-200">
          <p className="text-xs font-medium text-green-700">Pioneering tier achieved.</p>
        </div>
      )}
    </div>
  );
}

export default function ScoreHero({ result }: Props) {
  const { eu_csf, c3a, csi_composite, variant, instrument_version, selected_frameworks } = result;

  return (
    <div className="py-6">
      <div className="flex flex-wrap gap-4">
        {eu_csf && <EuCsfCard eu_csf={eu_csf} variant={variant} />}
        {c3a && <C3aCard c3a={c3a} />}
        {csi_composite && <CsiCard csi={csi_composite} variant={variant} />}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-center">
        {variant} · Instrument v{instrument_version} ·{' '}
        {selected_frameworks.join(', ')} ·{' '}
        Self-assessment only — not a certification
      </p>
    </div>
  );
}
