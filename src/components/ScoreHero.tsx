import type { AssessmentResult, EuCsfResult, C3aResult, CsiCompositeResult, CadaResult, C3aAttainmentBand } from '../../shared/src/types';
import { CSI_MATURITY_NAMES, CSI_MATURITY_COLORS } from '../lib/csi-display';

interface Props {
  result: AssessmentResult;
}

const SEAL_NAMES = ['No Sovereignty', 'Jurisdictional Sovereignty', 'Data Sovereignty', 'Digital Resilience', 'Full Digital Sovereignty'];
const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

const C3A_BAND_LABELS: Record<C3aAttainmentBand, string> = {
  not_attained: 'Not Attained',
  partially_attained: 'Partially Attained',
  substantially_attained: 'Substantially Attained',
  fully_attained: 'Fully Attained',
};
const C3A_BAND_COLORS: Record<C3aAttainmentBand, string> = {
  not_attained: '#dc2626',
  partially_attained: '#f97316',
  substantially_attained: '#eab308',
  fully_attained: '#16a34a',
};

function EuCsfCard({ eu_csf, variant }: { eu_csf: EuCsfResult; variant: string }) {
  const seal = eu_csf.global.seal;
  const pct = eu_csf.global.pct;
  const color = SEAL_COLORS[seal] ?? '#6b7280';
  const label = SEAL_NAMES[seal] ?? `Level ${seal}`;
  const levelPrefix = 'SEAL';

  return (
    <div className="border border-gray-200 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">EU Cloud Sovereignty Framework</div>
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white mb-2"
        style={{ backgroundColor: color }}>
        {levelPrefix} {seal} — {label}
      </div>
      {seal === 0 && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          Critical sovereignty prerequisites remain unmet. The assessed environment may still depend on external operational, technological, or supply-chain authorities incompatible with sovereign continuity objectives.
        </div>
      )}
      <div className="text-sm text-gray-500 mt-1">
        Sovereignty readiness: <span className="font-semibold tabular-nums" style={{ color }}>{Math.round(pct)}%</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Weakest-link gate: all level ≤{seal} criteria must be met. EU-CSF v1.2.1.
      </p>
    </div>
  );
}

function AttainmentBadge({ band }: { band: C3aAttainmentBand }) {
  const color = C3A_BAND_COLORS[band];
  return (
    <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}>
      {C3A_BAND_LABELS[band]}
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
          <AttainmentBadge band={crit.attainment} />
          <div className="text-xs text-gray-500 mt-1.5">
            {crit.passed}/{crit.applicable} criteria met (binary pass/fail)
          </div>
        </div>
        {c3a.layer_a_blocked && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-700 text-xs font-semibold mb-0.5">Layer A Sovereignty Failure</p>
            <p className="text-red-600 text-xs">Critical autonomy prerequisites remain externally dependent. The assessed environment cannot currently demonstrate autonomous continuity under jurisdictional, operational, or geopolitical disruption scenarios.</p>
          </div>
        )}
        {ac ? (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Additional Criteria</div>
            <AttainmentBadge band={ac.attainment} />
            <div className="text-xs text-gray-500 mt-1.5">{ac.passed}/{ac.applicable} met (customer-selected)</div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">No Additional Criteria selected.</div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">C3A v1.0. Binary pass/fail per criterion — attainment band reflects criteria met.</p>
    </div>
  );
}

// Tier definitions: label, color, min%, max%, segment width as % of bar
const CSI_TIERS = [
  { label: 'Dependent',          color: '#dc2626', min: 0,  max: 40,  w: 40 },
  { label: 'Managed Dependency', color: '#f97316', min: 41, max: 70,  w: 30 },
  { label: 'Strategic Autonomy', color: '#22c55e', min: 71, max: 90,  w: 20 },
  { label: 'Sovereign',          color: '#16a34a', min: 91, max: 100, w: 10 },
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

// %-coverage → maturity tier (mirrors scoring CSI_TIER_THRESHOLDS); used only to detect
// when the headline tier has been GATED below the coverage it would otherwise earn.
const CSI_TIER_THRESHOLDS = [0, 0.41, 0.71, 0.91];
function pctToTier(pct: number): number {
  const f = pct / 100;
  if (f >= CSI_TIER_THRESHOLDS[3]) return 3;
  if (f >= CSI_TIER_THRESHOLDS[2]) return 2;
  if (f >= CSI_TIER_THRESHOLDS[1]) return 1;
  return 0;
}

function CsiCard({ csi, variant }: { csi: CsiCompositeResult; variant: string }) {
  const isGeneralized = variant === 'Generalized';
  const csl = csi.global.csl;
  const pct = csi.global.pct;
  const pctToNext = csi.global.pct_to_next_tier;
  const gatingIds = csi.global.gating_objective_ids ?? [];
  const gatingTitles = gatingIds.map(id => csi.per_objective[id]?.title ?? id);

  // CSI speaks in CSL / maturity tiers — never SEAL. Generalized uses the maturity names;
  // the EU/EEA CSI uses the sovereignty names on the 0–4 CSL ladder (labelled "CSL", not SEAL).
  const color = isGeneralized ? (CSI_MATURITY_COLORS[csl] ?? '#6b7280') : (SEAL_COLORS[csl] ?? '#6b7280');
  const label = isGeneralized ? (CSI_MATURITY_NAMES[csl] ?? `CSL ${csl}`) : (SEAL_NAMES[csl] ?? `CSL ${csl}`);

  // Gated when the weakest-link assurance gate held the tier below what coverage would earn.
  const gated = isGeneralized && pctToTier(pct) > csl && gatingTitles.length > 0;

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">CSI Composite <span className="normal-case font-normal text-blue-400">(editorial)</span></div>
      <div className="text-5xl font-bold tabular-nums mb-1" style={{ color }}>{Math.round(pct)}%</div>
      <div className="text-xs text-gray-400 mb-2">sovereignty readiness (coverage)</div>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium text-white mb-3"
        style={{ backgroundColor: color }}>
        {isGeneralized ? label : `CSL ${csl} — ${label}`}
      </div>
      {isGeneralized && <MaturityBar pct={pct} csl={csl} />}
      {gated && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Assurance gate: held at <strong>{label}</strong> by{' '}
          <strong>{gatingTitles.join(', ')}</strong>. Your {Math.round(pct)}% coverage would
          reach {CSI_MATURITY_NAMES[pctToTier(pct)]}, but the weakest domain caps the tier —
          raise it to lift the gate.
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">
        CSI editorial blend of EU-CSF + C3A. Headline tier is gated by the weakest sovereignty
        domain (weakest-link). Not a source-standard certification.
      </p>
      {isGeneralized && !gated && pctToNext !== null && pctToNext > 0 && (
        <div className="mt-2 pt-2 border-t border-blue-200">
          <p className="text-xs font-medium text-blue-700">
            To reach {CSI_MATURITY_NAMES[csl + 1]}: {pctToNext}% more coverage needed
          </p>
        </div>
      )}
      {isGeneralized && !gated && csl >= 3 && (
        <div className="mt-2 pt-2 border-t border-blue-200">
          <p className="text-xs font-medium text-green-700">Sovereign tier achieved.</p>
        </div>
      )}
    </div>
  );
}

const UAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];
const UAL_NAMES = [
  'Not Attained',
  'Level 1 — Self-Assessment',
  'Level 2 — Third-Party Audited',
  'Level 3 — Enhanced',
  'Level 4 — Highest Assurance',
];

function CadaCard({ cada }: { cada: CadaResult }) {
  const level = cada.highest_level_achieved;
  const color = UAL_COLORS[level] ?? '#6b7280';
  const label = UAL_NAMES[level] ?? `Level ${level}`;
  const lastLevel = cada.levels[cada.levels.length - 1];
  const totalCriteria = lastLevel?.criteria_total ?? 0;
  const criteriaPassed = level === 0 ? 0 : (cada.levels.find(l => l.level === level)?.criteria_passed ?? 0);

  return (
    <div className="border border-purple-200 bg-purple-50 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-3">
        Cloud &amp; AI Development Act <span className="normal-case font-normal">(COM(2026) 502)</span>
      </div>
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white mb-2"
        style={{ backgroundColor: color }}>
        UAL {level} — {label}
      </div>
      {level === 0 && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          No Union Assurance Level attained. Level 1 criteria remain unmet.
        </div>
      )}
      {cada.audit_required && (
        <div className="mb-2 text-xs text-purple-700 bg-purple-100 border border-purple-200 rounded px-2 py-1 inline-block">
          Independent third-party audit required (UAL 2+)
        </div>
      )}
      <div className="text-sm text-gray-600 mt-1">
        {criteriaPassed}/{totalCriteria} cumulative criteria passed
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Proposed regulation — not yet adopted EU law. Results are indicative only.
      </p>
    </div>
  );
}

export default function ScoreHero({ result }: Props) {
  const { eu_csf, c3a, csi_composite, cada, variant, instrument_version, selected_frameworks } = result;

  return (
    <div className="py-6">
      <div className="flex flex-wrap gap-4">
        {eu_csf && <EuCsfCard eu_csf={eu_csf} variant={variant} />}
        {c3a && <C3aCard c3a={c3a} />}
        {csi_composite && <CsiCard csi={csi_composite} variant={variant} />}
        {cada && <CadaCard cada={cada} />}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-center">
        {variant} · Instrument v{instrument_version} ·{' '}
        {selected_frameworks.join(', ')} ·{' '}
        Self-assessment only — not a certification
      </p>
    </div>
  );
}
