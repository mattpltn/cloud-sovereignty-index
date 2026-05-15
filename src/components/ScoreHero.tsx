import type { AssessmentResult, EuCsfResult, C3aResult, CsiCompositeResult } from '../../shared/src/types';

interface Props {
  result: AssessmentResult;
}

const SEAL_NAMES = ['No Sovereignty', 'Jurisdictional Sovereignty', 'Data Sovereignty', 'Digital Resilience', 'Full Digital Sovereignty'];
const SEAL_COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function EuCsfCard({ eu_csf, variant }: { eu_csf: EuCsfResult; variant: string }) {
  const seal = eu_csf.global.seal;
  const pct = eu_csf.global.pct;
  const color = SEAL_COLORS[seal] ?? '#6b7280';
  const label = SEAL_NAMES[seal] ?? `Level ${seal}`;
  const levelPrefix = variant === 'Generalized' ? 'CSL' : 'SEAL';

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

function CsiCard({ csi, variant }: { csi: CsiCompositeResult; variant: string }) {
  const csl = csi.global.csl;
  const pct = csi.global.pct;
  const color = SEAL_COLORS[csl] ?? '#6b7280';
  const label = SEAL_NAMES[csl] ?? `Level ${csl}`;
  const levelPrefix = variant === 'Generalized' ? 'CSL' : 'SEAL';

  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-6 flex-1 min-w-0">
      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">CSI Composite <span className="normal-case font-normal text-blue-400">(editorial)</span></div>
      <div className="text-5xl font-bold tabular-nums mb-2" style={{ color }}>{Math.round(pct)}%</div>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium text-white mb-2"
        style={{ backgroundColor: color }}>
        {levelPrefix} {csl} — {label}
      </div>
      <p className="text-xs text-gray-500">
        CSI editorial blend of EU-CSF + C3A. Not a source-standard certification.
      </p>
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
