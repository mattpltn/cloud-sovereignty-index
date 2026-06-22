import type { ActionOwner } from '../../shared/src/action-owner';

// "What to do next" — splits every actionable item into two tracks so the reader
// instantly sees who must act: require it from the provider (contract) vs build it
// internally. Static (no hydration needed).

export interface ActionItem {
  /** question_id or clause id — used as React key and shown as the reference. */
  id: string;
  /** Short, human label (objective title or clause summary). */
  label: string;
  /** Optional one-line detail (the specific gap question or clause text snippet). */
  detail?: string;
  owner: ActionOwner;
  /** 'clause' = a model contract template to require; 'gap' = an unmet control. */
  kind: 'clause' | 'gap';
  /** Severity on the 0–4 ladder (CSL / contribution) for ordering + a small chip. */
  severity?: number;
  /** Infrastructure layer for clauses (e.g. "L1 · Facility"). */
  layer?: string;
}

interface Props {
  items: ActionItem[];
  /** Level word for the severity chip (CSL / SEAL / UAL). */
  levelLabel?: string;
}

const TRACK = {
  supplier: {
    title: 'Require from your provider',
    sub: 'Negotiate these into the contract or require them as provider commitments.',
    accent: 'border-indigo-200 bg-indigo-50',
    head: 'text-indigo-900',
    chip: 'bg-indigo-100 text-indigo-700',
  },
  internal: {
    title: 'Build & operate internally',
    sub: 'Controls your own organisation must put in place and run.',
    accent: 'border-emerald-200 bg-emerald-50',
    head: 'text-emerald-900',
    chip: 'bg-emerald-100 text-emerald-700',
  },
} as const;

function Track({ owner, items, levelLabel }: { owner: ActionOwner; items: ActionItem[]; levelLabel: string }) {
  const t = TRACK[owner];
  // Clauses first (concrete templates), then gaps; within each, lowest severity first.
  const sorted = [...items].sort((a, b) =>
    (a.kind === b.kind ? 0 : a.kind === 'clause' ? -1 : 1) ||
    ((a.severity ?? 99) - (b.severity ?? 99)));
  return (
    <div className={`flex-1 rounded-xl border p-4 ${t.accent}`}>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className={`text-sm font-semibold ${t.head}`}>{t.title}</h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.chip}`}>{items.length}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{t.sub}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Nothing flagged in this track.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map(item => (
            <li key={`${item.kind}-${item.id}`} className="bg-white/70 rounded-lg border border-white px-3 py-2">
              <div className="flex items-start gap-2">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                  item.kind === 'clause' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {item.kind === 'clause' ? 'Clause' : 'Gap'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  {item.detail && <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>}
                  <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {item.layer ? `${item.layer} · ` : ''}{item.id}
                    {item.severity != null && ` · ${levelLabel} ${item.severity}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActionTracks({ items, levelLabel = 'CSL' }: Props) {
  if (items.length === 0) return null;
  const supplier = items.filter(i => i.owner === 'supplier');
  const internal = items.filter(i => i.owner === 'internal');
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">What to do next</h3>
      <p className="text-xs text-gray-500 mb-3">
        Every action below is sorted by who must act — what to require from your provider, and what to build in-house.
      </p>
      <div className="flex flex-col md:flex-row gap-3">
        <Track owner="supplier" items={supplier} levelLabel={levelLabel} />
        <Track owner="internal" items={internal} levelLabel={levelLabel} />
      </div>
    </div>
  );
}
