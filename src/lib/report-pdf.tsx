import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import type { AssessmentResult, EuCsfObjectiveResult, CsiObjectiveResult } from '../../shared/src/types.js';
import { resolvePlaceholders } from '../../shared/src/tier-resolution.js';

interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }

const SEAL_LABELS = ['No Sovereignty', 'Minimal Sovereignty', 'Partial Sovereignty', 'Substantial Sovereignty', 'Full Digital Sovereignty'];
const SEAL_COLORS_HEX = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function getQuestionMeta(criteria: CriteriaFile, qid: string, tier: string) {
  for (const obj of criteria.objectives) {
    const q = obj.questions.find((q: Question) => q.id === qid);
    if (!q) continue;
    if (q.type === 'single') return {
      title: q.title,
      source: q.source?.clause ?? '',
      text: q.text,
      supplementary: q.supplementary_info ?? '',
    };
    if (q.type === 'tiered') {
      const tierData = tier === 'national' ? q.tiers.national : q.tiers.bloc;
      return {
        title: q.title,
        source: tierData?.source?.clause ?? '',
        text: tierData?.text ?? '',
        supplementary: q.supplementary_info ?? '',
      };
    }
  }
  return { title: qid, source: '', text: '', supplementary: '' };
}

function getQuestionTitle(criteria: CriteriaFile, qid: string): string {
  return getQuestionMeta(criteria, qid, 'bloc').title;
}

export async function buildReportPdf(
  result: AssessmentResult,
  criteria: CriteriaFile,
  companyName?: string,
  country?: Country,
): Promise<Blob> {
  // Import actual React PDF components — helpers must be defined AFTER this
  const { Document, Page, Text, View, StyleSheet, pdf, Svg, Line, Polygon, Rect } = await import('@react-pdf/renderer');
  const { createElement: h } = await import('react');

  // ── Helpers that close over real PDF components ──────────────────────────────

  function buildObjectiveScorecardSection(
    objectives: Array<EuCsfObjectiveResult | CsiObjectiveResult>,
    levelKey: 'seal' | 'csl',
    levelPrefix: string,
  ) {
    const BAR_WIDTH = 72;
    return [
      h(View, { style: styles.tableHeader },
        h(Text, { style: styles.colId }, 'ID'),
        h(Text, { style: styles.colTitle }, 'Objective'),
        h(Text, { style: { ...styles.colPct, width: BAR_WIDTH + 4 } }, 'Score'),
        h(Text, { style: styles.colSeal }, levelPrefix),
      ),
      ...objectives.map((obj, i) => {
        const level = (obj as Record<string, unknown>)[levelKey] as number;
        const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
        const color = SEAL_COLORS_HEX[level] ?? '#6b7280';
        const fillW = Math.round((pct / 100) * BAR_WIDTH);
        return h(View, { key: obj.objective_id, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
          h(Text, { style: { ...styles.colId, color } }, obj.objective_id),
          h(Text, { style: styles.colTitle }, obj.title),
          // Mini score bar
          h(View, { style: { width: BAR_WIDTH + 4, justifyContent: 'center' } },
            h(Svg as any, { width: BAR_WIDTH, height: 12 },
              h(Rect as any, { x: 0, y: 2, width: BAR_WIDTH, height: 8, rx: 3, fill: '#e5e7eb' }),
              fillW > 0 ? h(Rect as any, { x: 0, y: 2, width: fillW, height: 8, rx: 3, fill: color }) : null,
            ),
            h(Text, { style: { fontSize: 8, color, textAlign: 'center' } }, `${pct}%`),
          ),
          h(Text, { style: { ...styles.colSeal, color } }, `${levelPrefix} ${level}`),
        );
      }),
    ];
  }

  // Radar chart for per-objective scores
  function buildRadarChart(
    objectives: Array<EuCsfObjectiveResult | CsiObjectiveResult>,
    levelColors: string[],
    levelKey: 'seal' | 'csl',
  ) {
    const SIZE = 220;
    const CX = SIZE / 2;
    const CY = SIZE / 2;
    const R = 80;
    const N = objectives.length;
    if (N === 0) return null;

    function toPoint(angle: number, radius: number) {
      return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
    }

    const angles = objectives.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / N);

    // Grid polygons at 25%, 50%, 75%, 100%
    const gridLevels = [0.25, 0.5, 0.75, 1.0];
    const gridPolygons = gridLevels.map(frac => {
      const pts = angles.map(a => toPoint(a, R * frac));
      return pts.map(p => `${p.x},${p.y}`).join(' ');
    });

    // Score polygon
    const scorePolygon = objectives.map((obj, i) => {
      const pct = obj.max_score > 0 ? (obj.raw_score / obj.max_score) : 0;
      const pt = toPoint(angles[i], R * Math.min(pct, 1));
      return `${pt.x},${pt.y}`;
    }).join(' ');

    // Axis lines
    const axisLines = angles.map((a, i) => {
      const end = toPoint(a, R);
      return h(Line as any, { key: i, x1: CX, y1: CY, x2: end.x, y2: end.y, stroke: '#d1d5db', strokeWidth: 0.5 });
    });

    // Labels
    const labels = objectives.map((obj, i) => {
      const labelR = R + 14;
      const pt = toPoint(angles[i], labelR);
      const level = (obj as Record<string, unknown>)[levelKey] as number;
      const color = levelColors[level] ?? '#6b7280';
      return h(Text as any, { key: i, x: pt.x, y: pt.y, fontSize: 6, fill: color, textAnchor: 'middle', dominantBaseline: 'middle' }, obj.objective_id);
    });

    return h(View, { style: { alignItems: 'center', marginVertical: 8 } },
      h(Svg as any, { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}` },
        // Grid rings
        ...gridPolygons.map((pts, i) =>
          h(Polygon as any, { key: i, points: pts, fill: 'none', stroke: '#e5e7eb', strokeWidth: 0.5 })
        ),
        // Grid % labels on the top axis
        ...[0.25, 0.5, 0.75, 1.0].map((frac, i) => {
          const y = CY - R * frac - 2;
          return h(Text as any, { key: i, x: CX + 2, y, fontSize: 5, fill: '#9ca3af' }, `${frac * 100}%`);
        }),
        // Axes
        ...axisLines,
        // Score polygon (filled)
        h(Polygon as any, {
          points: scorePolygon,
          fill: 'rgba(59,130,246,0.15)',
          stroke: '#3b82f6',
          strokeWidth: 1.5,
        }),
        // Objective labels
        ...labels,
      )
    );
  }

  // Maturity progress bar (CSI Composite, non-EU)
  const CSI_TIER_LABELS = ['Foundational', 'Developing', 'Advanced', 'Pioneering'];
  const CSI_TIER_RANGES = ['0–40%', '41–70%', '71–90%', '91–100%'];
  const CSI_TIER_COLORS = ['#dc2626', '#f97316', '#22c55e', '#16a34a'];
  const CSI_TIER_WIDTHS = [0.40, 0.30, 0.20, 0.10];

  function buildMaturityBar(pct: number, csl: number, pctToNext: number | null) {
    const BAR_W = 440;
    const BAR_H = 22;
    const MARKER_ABOVE = 16; // space for score label above bar
    const LABEL_H = 24;     // space for two lines below (name + range)
    const TOTAL_H = MARKER_ABOVE + BAR_H + LABEL_H;

    let offsetX = 0;
    const segments = CSI_TIER_WIDTHS.map((w, i) => {
      const segW = Math.round(BAR_W * w);
      const x = offsetX;
      offsetX += segW;
      return { x, w: segW, i };
    });

    const markerX = Math.min(Math.round((pct / 100) * BAR_W), BAR_W - 1);
    const markerY0 = MARKER_ABOVE;
    const markerY1 = MARKER_ABOVE + BAR_H;

    return h(View, { style: { marginVertical: 10 } },
      h(Text, { style: { fontSize: 9, color: '#374151', marginBottom: 6, fontFamily: 'Helvetica-Bold' } },
        'Progressive Sovereignty Maturity'
      ),
      h(Svg as any, { width: BAR_W, height: TOTAL_H },
        // Bar segments
        ...segments.map(seg => {
          const isActive = seg.i === csl;
          const isPast   = seg.i < csl;
          return h(Rect as any, {
            key: seg.i,
            x: seg.x, y: markerY0, width: seg.w, height: BAR_H,
            rx: seg.i === 0 ? 3 : (seg.i === 3 ? 3 : 0),
            fill: isActive ? CSI_TIER_COLORS[csl] : isPast ? CSI_TIER_COLORS[seg.i] : '#e5e7eb',
            opacity: isPast ? 0.35 : 1,
          });
        }),
        // Divider lines between segments
        ...segments.slice(1).map(seg =>
          h(Line as any, { key: seg.i, x1: seg.x, y1: markerY0, x2: seg.x, y2: markerY1, stroke: '#fff', strokeWidth: 1.5 })
        ),
        // Score marker line
        h(Line as any, { x1: markerX, y1: markerY0 - 2, x2: markerX, y2: markerY1 + 2, stroke: '#111827', strokeWidth: 2 }),
        // Score label above marker (small triangle + number)
        h(Text as any, {
          x: markerX, y: markerY0 - 4,
          fontSize: 8, fill: '#111827', textAnchor: 'middle', fontFamily: 'Helvetica-Bold',
        }, `${Math.round(pct)}%`),
        // Tier name labels below bar
        ...segments.map(seg => {
          const isActive = seg.i === csl;
          return h(Text as any, {
            key: `name-${seg.i}`,
            x: seg.x + seg.w / 2, y: markerY1 + 10,
            fontSize: isActive ? 7 : 6,
            fill: isActive ? CSI_TIER_COLORS[csl] : '#9ca3af',
            textAnchor: 'middle',
            fontFamily: isActive ? 'Helvetica-Bold' : 'Helvetica',
          }, CSI_TIER_LABELS[seg.i]);
        }),
        // Range labels below tier names
        ...segments.map(seg =>
          h(Text as any, {
            key: `range-${seg.i}`,
            x: seg.x + seg.w / 2, y: markerY1 + 20,
            fontSize: 5.5, fill: '#c4c4c4', textAnchor: 'middle',
          }, CSI_TIER_RANGES[seg.i])
        ),
        // "→ next tier" arrow on the right edge of current segment if not pioneering
        ...(pctToNext !== null && pctToNext > 0 && csl < 3 ? [
          h(Text as any, {
            x: segments[csl].x + segments[csl].w - 2,
            y: markerY0 + BAR_H / 2 + 3,
            fontSize: 8, fill: '#ffffff', textAnchor: 'end',
          }, `+${pctToNext}% →`),
        ] : []),
      ),
    );
  }

  const tierCtx = { variant: result.variant, country: country as Parameters<typeof resolvePlaceholders>[1]['country'] };
  function resolve(text: string): string { return resolvePlaceholders(text, tierCtx); }

  function buildGapSection(
    gaps: Array<{ objective_id: string; question_id: string; tier: string; gap_score: number }>,
    sectionLabel: string,
  ) {
    const topGaps = gaps.slice(0, 5);
    return [
      h(Text, { style: styles.subSectionTitle }, `Priority Improvement Areas — ${sectionLabel}`),
      topGaps.length === 0
        ? h(Text, { style: styles.bodyText }, 'No improvement areas identified.')
        : h(View, {},
            ...topGaps.map((gap, i) => {
              const meta = getQuestionMeta(criteria, gap.question_id, gap.tier);
              const rawText = resolve(meta.text);
              const rawSupp = resolve(meta.supplementary);
              const children: unknown[] = [
                h(Text, { style: styles.cardTitle }, `#${i + 1}. ${meta.title} — ${gap.question_id}`),
              ];
              if (meta.source) children.push(h(Text, { style: { ...styles.cardBody, color: '#9ca3af', marginBottom: 2 } }, `Ref: ${meta.source}`));
              if (rawText) children.push(h(Text, { style: { ...styles.cardBody, marginBottom: rawSupp ? 2 : 0 } },
                rawText.slice(0, 400) + (rawText.length > 400 ? '…' : '')
              ));
              if (rawSupp) children.push(h(Text, { style: { ...styles.cardBody, color: '#6b7280' } },
                rawSupp.slice(0, 200) + (rawSupp.length > 200 ? '…' : '')
              ));
              return h(View, { key: i, style: styles.improvCard, wrap: false }, ...children);
            }),
          ),
    ];
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingHorizontal: 48, paddingVertical: 48 },
    coverPage: { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingHorizontal: 48, paddingVertical: 80, backgroundColor: '#f9fafb' },
    coverTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: '#111827' },
    coverSub: { fontSize: 14, color: '#4b5563', marginBottom: 40 },
    coverMeta: { fontSize: 10, color: '#6b7280', marginBottom: 6 },
    coverSealBox: { marginTop: 16, marginBottom: 8, padding: 16, backgroundColor: '#ffffff', borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb' },
    coverSealScore: { fontSize: 32, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
    coverSealLabel: { fontSize: 11, color: '#4b5563' },
    coverScopeNote: { marginTop: 24, fontSize: 9, color: '#9ca3af', lineHeight: 1.5 },
    sectionTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4 },
    subSectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6, color: '#374151' },
    bodyText: { fontSize: 10, color: '#374151', lineHeight: 1.6, marginBottom: 8 },
    tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: 6, borderRadius: 4, marginBottom: 2 },
    tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    tableRowAlt: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#f9fafb' },
    colId: { width: 60, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
    colTitle: { flex: 1, fontSize: 9 },
    colPct: { width: 50, fontSize: 9, textAlign: 'right' },
    colSeal: { width: 60, fontSize: 9, textAlign: 'right' },
    strengthCard: { backgroundColor: '#f0fdf4', borderLeftWidth: 3, borderLeftColor: '#22c55e', padding: 10, marginBottom: 6, borderRadius: 4 },
    weakCard: { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#dc2626', padding: 10, marginBottom: 6, borderRadius: 4 },
    improvCard: { backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: '#f97316', padding: 10, marginBottom: 6, borderRadius: 4 },
    cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3, color: '#111827' },
    cardBody: { fontSize: 9, color: '#4b5563', lineHeight: 1.5 },
    noteBox: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 6, marginTop: 16 },
    footer: { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#9ca3af', flexDirection: 'row', justifyContent: 'space-between' },
  });

  const isGeneralized = result.variant === 'Generalized';
  const levelPrefix = isGeneralized ? 'CSL' : 'SEAL';

  const CSI_MATURITY_LABELS = ['Foundational', 'Developing', 'Advanced', 'Pioneering'];
  const CSI_MATURITY_HEX = ['#dc2626', '#f97316', '#22c55e', '#16a34a'];

  const selectedFrameworks = result.selected_frameworks ?? ['csi_composite'];
  const frameworkNames = selectedFrameworks.map(f => {
    if (f === 'eu_csf') return 'EU-CSF v1.2.1';
    if (f === 'c3a') return 'BSI C3A v1.0';
    if (f === 'csi_composite') return 'CSI Composite';
    return f;
  });

  const dateStr = result.assessed_at
    ? new Date(result.assessed_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unknown date';

  const footer = h(View, { style: styles.footer },
    h(Text, {}, 'Cloud Sovereignty Index — Self-assessment, not an official certification'),
    h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
  );

  // ── Cover page results summary ───────────────────────────────────────────────
  const coverResults: unknown[] = [];
  if (result.eu_csf) {
    const { seal, pct } = result.eu_csf.global;
    const color = SEAL_COLORS_HEX[seal] ?? '#6b7280';
    coverResults.push(h(View, { style: { ...styles.coverSealBox, borderLeftWidth: 4, borderLeftColor: color, flex: 1 } },
      h(Text, { style: { ...styles.coverSealScore, color } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, `EU-CSF ${levelPrefix} ${seal}`),
      h(Text, { style: { ...styles.coverSealLabel, fontSize: 9, color: '#9ca3af' } }, SEAL_LABELS[seal]),
    ));
  }
  if (result.c3a) {
    const { passed, applicable, pct } = result.c3a.criterion.global;
    const ac = result.c3a.additional_criterion.global;
    coverResults.push(h(View, { style: { ...styles.coverSealBox, borderLeftWidth: 4, borderLeftColor: '#374151', flex: 1 } },
      h(Text, { style: { ...styles.coverSealScore, color: '#374151' } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, `C3A — ${passed}/${applicable} met`),
      ac ? h(Text, { style: { ...styles.coverSealLabel, fontSize: 9, color: '#9ca3af' } }, `AC: ${ac.passed}/${ac.applicable}`) : null,
    ));
  }
  if (result.csi_composite) {
    const { csl, pct } = result.csi_composite.global;
    const color = isGeneralized ? (CSI_MATURITY_HEX[csl] ?? '#6b7280') : (SEAL_COLORS_HEX[csl] ?? '#6b7280');
    const csiLabel = isGeneralized ? (CSI_MATURITY_LABELS[csl] ?? `Tier ${csl}`) : `${levelPrefix} ${csl} — ${SEAL_LABELS[csl]}`;
    coverResults.push(h(View, { style: { ...styles.coverSealBox, borderLeftWidth: 4, borderLeftColor: color, flex: 1 } },
      h(Text, { style: { ...styles.coverSealScore, color } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, 'CSI Composite'),
      h(Text, { style: { ...styles.coverSealLabel, fontSize: 9, color: '#9ca3af' } }, csiLabel),
    ));
  }

  // ── EU-CSF detail pages ──────────────────────────────────────────────────────
  const euCsfPages: unknown[] = [];
  if (result.eu_csf) {
    const euObjectives = Object.values(result.eu_csf.per_objective);
    const euSeal = result.eu_csf.global.seal;
    const strengths = euObjectives.filter(o => o.seal >= 3);
    const weaknesses = euObjectives.filter(o => o.seal <= 1 || (o.seal === euSeal && euSeal < 4));

    euCsfPages.push(h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, 'EU Cloud Sovereignty Framework (EU-CSF v1.2.1)'),
      h(Text, { style: { ...styles.bodyText, color: '#6b7280' } },
        `Global result: ${levelPrefix} ${euSeal} — ${SEAL_LABELS[euSeal]} (${Math.round(result.eu_csf.global.pct)}%). ` +
        `Weakest-link gate per EU-CSF §4. Weights per EU-CSF §5.`
      ),
      buildRadarChart(euObjectives, SEAL_COLORS_HEX, 'seal'),
      h(Text, { style: styles.subSectionTitle }, 'Objective Scorecard'),
      ...buildObjectiveScorecardSection(euObjectives, 'seal', levelPrefix),
      h(Text, { style: styles.subSectionTitle }, 'Strengths'),
      strengths.length === 0
        ? h(Text, { style: styles.bodyText }, `No objective has reached ${levelPrefix} 3 yet.`)
        : h(View, {}, ...strengths.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            return h(View, { key: obj.objective_id, style: styles.strengthCard, wrap: false },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${levelPrefix} ${obj.seal}, ${pct}%`),
            );
          })),
      h(Text, { style: styles.subSectionTitle }, 'Weaknesses'),
      weaknesses.length === 0
        ? h(Text, { style: styles.bodyText }, 'No significant weaknesses identified.')
        : h(View, {}, ...weaknesses.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            const topGap = result.eu_csf!.gap_report.find(g => g.objective_id === obj.objective_id);
            return h(View, { key: obj.objective_id, style: styles.weakCard, wrap: false },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${levelPrefix} ${obj.seal}, ${pct}%`),
              topGap ? h(Text, { style: styles.cardBody }, `Top gap: ${getQuestionTitle(criteria, topGap.question_id)} (${topGap.question_id})`) : null,
            );
          })),
      ...buildGapSection(result.eu_csf.gap_report, 'EU-CSF'),
      footer,
    ));
  }

  // ── C3A detail page ──────────────────────────────────────────────────────────
  const c3aPages: unknown[] = [];
  if (result.c3a) {
    const crit = result.c3a.criterion.global;
    const ac = result.c3a.additional_criterion.global;
    const failedCriteria = result.c3a.failed_criteria;

    c3aPages.push(h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, 'BSI C3A — Criteria enabling Cloud Computing Autonomy (v1.0)'),
      h(Text, { style: { ...styles.bodyText, color: '#6b7280' } },
        `Criterion: ${crit.passed}/${crit.applicable} met (${Math.round(crit.pct)}%). ` +
        (ac ? `Additional Criterion: ${ac.passed}/${ac.applicable} met (${Math.round(ac.pct)}%). ` : 'No Additional Criteria selected. ') +
        'Binary pass/fail — no SEAL, no partial credit.'
      ),
      h(Text, { style: styles.subSectionTitle }, 'Per-Objective Results'),
      h(View, { style: styles.tableHeader },
        h(Text, { style: styles.colId }, 'Objective'),
        h(Text, { style: { ...styles.colTitle } }, 'Criterion'),
        h(Text, { style: styles.colSeal }, 'AC'),
      ),
      ...Object.entries(result.c3a.criterion.per_objective).map(([objId, objCrit], i) => {
        const objAc = result.c3a!.additional_criterion.per_objective[objId];
        const color = objCrit.applicable > 0 && objCrit.pct === 100 ? '#16a34a' : objCrit.pct >= 50 ? '#f97316' : '#dc2626';
        return h(View, { key: objId, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
          h(Text, { style: styles.colId }, objId),
          h(Text, { style: { ...styles.colTitle, color } },
            objCrit.applicable > 0 ? `${objCrit.passed}/${objCrit.applicable} (${Math.round(objCrit.pct)}%)` : '—'
          ),
          h(Text, { style: styles.colSeal },
            (objAc && objAc.applicable > 0) ? `${objAc.passed}/${objAc.applicable}` : '—'
          ),
        );
      }),
      failedCriteria.length > 0 ? h(View, {},
        h(Text, { style: styles.subSectionTitle }, 'Failed Criteria'),
        ...failedCriteria.map(fc => h(View, { key: fc.question_id, style: styles.weakCard, wrap: false },
          h(Text, { style: styles.cardTitle }, `${fc.question_id} — ${fc.title}`),
          h(Text, { style: styles.cardBody }, `Tier: ${fc.tier}`),
        )),
      ) : null,
      footer,
    ));
  }

  // ── CSI Composite detail pages ───────────────────────────────────────────────
  const csiPages: unknown[] = [];
  if (result.csi_composite) {
    const csiObjectives = Object.values(result.csi_composite.per_objective);
    const csiCsl = result.csi_composite.global.csl;
    const csiPct = result.csi_composite.global.pct;
    const pctToNext = result.csi_composite.global.pct_to_next_tier;

    const csiLevelColors = isGeneralized ? CSI_MATURITY_HEX : SEAL_COLORS_HEX;
    const csiTierLabel = isGeneralized
      ? (CSI_MATURITY_LABELS[csiCsl] ?? `Tier ${csiCsl}`)
      : (SEAL_LABELS[csiCsl] ?? `Level ${csiCsl}`);
    const csiLevelPrefix = isGeneralized ? '' : levelPrefix + ' ';

    const strengths = isGeneralized
      ? csiObjectives.filter(o => o.csl >= 2)
      : csiObjectives.filter(o => o.csl >= 3);
    const weaknesses = isGeneralized
      ? csiObjectives.filter(o => o.csl <= 0)
      : csiObjectives.filter(o => o.csl <= 1 || (o.csl === csiCsl && csiCsl < 4));

    csiPages.push(h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, 'CSI Composite (editorial framework)'),
      h(Text, { style: { ...styles.bodyText, color: '#6b7280' } },
        isGeneralized
          ? `Global result: ${csiTierLabel} — ${Math.round(csiPct)}%. Progressive Sovereignty Maturity model. Not a source-standard certification.`
          : `Global result: ${levelPrefix} ${csiCsl} — ${csiTierLabel} (${Math.round(csiPct)}%). Editorial blend of EU-CSF and C3A. Not a source-standard certification.`
      ),
      // Maturity bar (non-EU only)
      isGeneralized ? buildMaturityBar(csiPct, csiCsl, pctToNext) : null,
      buildRadarChart(csiObjectives, csiLevelColors, 'csl'),
      h(Text, { style: styles.subSectionTitle }, 'Objective Scorecard'),
      ...buildObjectiveScorecardSection(csiObjectives, 'csl', isGeneralized ? 'Tier' : levelPrefix),
      h(Text, { style: styles.subSectionTitle }, 'Strengths'),
      strengths.length === 0
        ? h(Text, { style: styles.bodyText }, `No objective has reached ${isGeneralized ? 'Advanced' : levelPrefix + ' 3'} yet.`)
        : h(View, {}, ...strengths.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            const lbl = isGeneralized ? (CSI_MATURITY_LABELS[obj.csl] ?? `Tier ${obj.csl}`) : `${levelPrefix} ${obj.csl}`;
            return h(View, { key: obj.objective_id, style: styles.strengthCard, wrap: false },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${lbl}, ${pct}%`),
            );
          })),
      h(Text, { style: styles.subSectionTitle }, 'Weaknesses'),
      weaknesses.length === 0
        ? h(Text, { style: styles.bodyText }, 'No significant weaknesses identified.')
        : h(View, {}, ...weaknesses.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            const topGap = result.csi_composite!.gap_report.find(g => g.objective_id === obj.objective_id);
            const lbl = isGeneralized ? (CSI_MATURITY_LABELS[obj.csl] ?? `Tier ${obj.csl}`) : `${levelPrefix} ${obj.csl}`;
            return h(View, { key: obj.objective_id, style: styles.weakCard, wrap: false },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${lbl}, ${pct}%`),
              topGap ? h(Text, { style: styles.cardBody }, `Top gap: ${getQuestionTitle(criteria, topGap.question_id)} (${topGap.question_id})`) : null,
            );
          })),
      ...buildGapSection(result.csi_composite.gap_report, 'CSI Composite'),
      // Roadmap to next tier (non-EU only)
      isGeneralized ? h(View, { style: { marginTop: 12 } },
        h(Text, { style: styles.subSectionTitle },
          pctToNext !== null && pctToNext > 0
            ? `Roadmap to ${CSI_MATURITY_LABELS[csiCsl + 1]}`
            : 'Pioneering Tier Achieved'
        ),
        pctToNext !== null && pctToNext > 0
          ? h(View, {},
              h(Text, { style: styles.bodyText },
                `To advance from ${csiTierLabel} to ${CSI_MATURITY_LABELS[csiCsl + 1]}, an additional ${pctToNext}% of weighted points is needed.`
              ),
              h(Text, { style: { ...styles.bodyText, fontFamily: 'Helvetica-Bold' } }, 'Top actions to close the gap:'),
              ...result.csi_composite!.gap_report.slice(0, 3).map((gap, i) => {
                const meta = getQuestionMeta(criteria, gap.question_id, gap.tier);
                return h(View, { key: i, style: { ...styles.improvCard, marginBottom: 4 }, wrap: false },
                  h(Text, { style: styles.cardTitle }, `${i + 1}. ${meta.title} (${gap.question_id})`),
                  meta.source ? h(Text, { style: { ...styles.cardBody, color: '#9ca3af' } }, `Ref: ${meta.source}`) : null,
                );
              }),
            )
          : h(Text, { style: styles.bodyText },
              'This assessment has achieved the Pioneering tier — the highest maturity level in the CSI Progressive Sovereignty Maturity model.'
            ),
      ) : null,
      footer,
    ));
  }

  const doc = h(Document, {},
    // Cover page
    h(Page, { size: 'A4', style: styles.coverPage },
      h(View, {},
        h(Text, { style: styles.coverTitle }, 'Cloud Sovereignty\nAssessment Report'),
        h(Text, { style: styles.coverSub }, companyName ?? 'Confidential Assessment'),
        // Meta strip
        h(View, { style: { flexDirection: 'row', gap: 16, marginBottom: 24 } },
          h(Text, { style: styles.coverMeta }, `${dateStr}`),
          country ? h(Text, { style: styles.coverMeta }, `· ${country.name}`) : null,
          h(Text, { style: styles.coverMeta }, `· Instrument v${result.instrument_version}`),
        ),
        // Score boxes in a row
        h(View, { style: { flexDirection: 'row', gap: 12, marginTop: 8 } },
          ...coverResults,
        ),
        h(Text, { style: styles.coverScopeNote },
          `Framework(s): ${frameworkNames.join(', ')}\n` +
          'Scope: cloud sovereignty only. Security attestation (e.g. ISO 27001, SOC 2, BSI C5) is assumed and not assessed in this report.'
        ),
      ),
      footer,
    ),
    ...euCsfPages,
    ...c3aPages,
    ...csiPages,
    // Methodology note
    h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, 'Methodology & Disclaimer'),
      h(View, { style: styles.noteBox },
        h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          'This is a self-assessment, not a certification. Results are indicative and based solely on the responses provided.'
        ),
        result.eu_csf ? h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          'EU-CSF results follow EU Cloud Sovereignty Framework v1.2.1 (European Commission). ' +
          `${levelPrefix} levels use a weakest-link gate. Weights: SOV-1 15%, SOV-2 10%, SOV-3 10%, SOV-4 15%, SOV-5 20%, SOV-6 15%, SOV-7 10%, SOV-8 5%.`
        ) : null,
        result.c3a ? h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          'C3A results follow BSI Criteria enabling Cloud Computing Autonomy v1.0. Binary pass/fail. Partial = not-met. ACs included only when customer-selected.'
        ) : null,
        result.csi_composite ? h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          isGeneralized
            ? 'CSI Composite (non-EU): Progressive Sovereignty Maturity model. No weakest-link gate. Tiers: Foundational (0–40%), Developing (41–70%), Advanced (71–90%), Pioneering (91–100%). "planned" answers earn 25% of question points. Fallback questions SOV-4-01-FB and SOV-4-09-FB available for providers unable to meet strict EU criteria.'
            : 'CSI Composite (EU/EEA): editorial blend of EU-CSF and C3A with the same SEAL 0–4 weakest-link gate. Not a source-standard certification.'
        ) : null,
        h(Text, { style: styles.bodyText },
          'This tool is not affiliated with or endorsed by BSI or the European Commission. Published under the MIT license.'
        ),
      ),
      footer,
    ),
  );

  const blob = await pdf(doc).toBlob();
  return blob;
}
