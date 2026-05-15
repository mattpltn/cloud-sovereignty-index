import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import type { AssessmentResult, EuCsfObjectiveResult, CsiObjectiveResult } from '../../shared/src/types.js';

interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }

const SEAL_LABELS = ['No Sovereignty', 'Minimal Sovereignty', 'Partial Sovereignty', 'Substantial Sovereignty', 'Full Digital Sovereignty'];
const SEAL_COLORS_HEX = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function getQuestionMeta(criteria: CriteriaFile, qid: string, tier: string) {
  for (const obj of criteria.objectives) {
    const q = obj.questions.find((q: Question) => q.id === qid);
    if (!q) continue;
    if (q.type === 'single') return { title: q.title, source: q.source?.clause ?? '', supplementary: q.supplementary_info ?? '' };
    if (q.type === 'tiered') {
      const tierData = tier === 'national' ? q.tiers.national : q.tiers.bloc;
      return { title: q.title, source: tierData?.source?.clause ?? '', supplementary: q.supplementary_info ?? '' };
    }
  }
  return { title: qid, source: '', supplementary: '' };
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
  const { Document, Page, Text, View, StyleSheet, pdf } = await import('@react-pdf/renderer');
  const { createElement: h } = await import('react');

  // ── Helpers that close over real PDF components ──────────────────────────────

  function buildObjectiveScorecardSection(
    objectives: Array<EuCsfObjectiveResult | CsiObjectiveResult>,
    levelKey: 'seal' | 'csl',
    levelPrefix: string,
  ) {
    return [
      h(View, { style: styles.tableHeader },
        h(Text, { style: styles.colId }, 'ID'),
        h(Text, { style: styles.colTitle }, 'Objective'),
        h(Text, { style: styles.colPct }, 'Score'),
        h(Text, { style: styles.colSeal }, levelPrefix),
      ),
      ...objectives.map((obj, i) => {
        const level = (obj as Record<string, unknown>)[levelKey] as number;
        const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
        const color = SEAL_COLORS_HEX[level] ?? '#6b7280';
        return h(View, { key: obj.objective_id, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
          h(Text, { style: { ...styles.colId, color } }, obj.objective_id),
          h(Text, { style: styles.colTitle }, obj.title),
          h(Text, { style: { ...styles.colPct, color } }, `${pct}%`),
          h(Text, { style: { ...styles.colSeal, color } }, `${levelPrefix} ${level}`),
        );
      }),
    ];
  }

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
              return h(View, { key: i, style: styles.improvCard },
                h(Text, { style: styles.cardTitle }, `#${i + 1}. ${meta.title} — ${gap.question_id} (${gap.tier})`),
                meta.source ? h(Text, { style: { ...styles.cardBody, color: '#9ca3af', marginBottom: 3 } }, `Source: ${meta.source}`) : null,
                h(Text, { style: styles.cardBody },
                  meta.supplementary
                    ? meta.supplementary.slice(0, 300) + (meta.supplementary.length > 300 ? '…' : '')
                    : 'Address this criterion to improve your sovereignty score.'
                ),
              );
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
    coverResults.push(h(View, { style: styles.coverSealBox },
      h(Text, { style: { ...styles.coverSealScore, color: SEAL_COLORS_HEX[seal] ?? '#6b7280' } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, `EU-CSF ${levelPrefix} ${seal} — ${SEAL_LABELS[seal]}`),
    ));
  }
  if (result.c3a) {
    const { passed, applicable, pct } = result.c3a.criterion.global;
    const ac = result.c3a.additional_criterion.global;
    coverResults.push(h(View, { style: styles.coverSealBox },
      h(Text, { style: { ...styles.coverSealScore, color: '#374151' } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, `C3A Criterion — ${passed}/${applicable} met${ac ? ` · AC ${ac.passed}/${ac.applicable}` : ''}`),
    ));
  }
  if (result.csi_composite) {
    const { csl, pct } = result.csi_composite.global;
    coverResults.push(h(View, { style: styles.coverSealBox },
      h(Text, { style: { ...styles.coverSealScore, color: SEAL_COLORS_HEX[csl] ?? '#6b7280' } }, `${Math.round(pct)}%`),
      h(Text, { style: styles.coverSealLabel }, `CSI Composite ${levelPrefix} ${csl} — ${SEAL_LABELS[csl]}`),
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
      h(Text, { style: styles.subSectionTitle }, 'Objective Scorecard'),
      ...buildObjectiveScorecardSection(euObjectives, 'seal', levelPrefix),
      h(Text, { style: styles.subSectionTitle }, 'Strengths'),
      strengths.length === 0
        ? h(Text, { style: styles.bodyText }, `No objective has reached ${levelPrefix} 3 yet.`)
        : h(View, {}, ...strengths.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            return h(View, { key: obj.objective_id, style: styles.strengthCard },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${levelPrefix} ${obj.seal}, ${pct}%`),
            );
          })),
      h(Text, { style: styles.subSectionTitle }, 'Weaknesses'),
      weaknesses.length === 0
        ? h(Text, { style: styles.bodyText }, 'No significant weaknesses identified.')
        : h(View, {}, ...weaknesses.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            const topGap = result.eu_csf!.gap_report.find(g => g.objective_id === obj.objective_id);
            return h(View, { key: obj.objective_id, style: styles.weakCard },
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
        ...failedCriteria.map(fc => h(View, { key: fc.question_id, style: styles.weakCard },
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
    const strengths = csiObjectives.filter(o => o.csl >= 3);
    const weaknesses = csiObjectives.filter(o => o.csl <= 1 || (o.csl === csiCsl && csiCsl < 4));

    csiPages.push(h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, 'CSI Composite (editorial framework)'),
      h(Text, { style: { ...styles.bodyText, color: '#6b7280' } },
        `Global result: ${levelPrefix} ${csiCsl} — ${SEAL_LABELS[csiCsl]} (${Math.round(result.csi_composite.global.pct)}%). ` +
        `Editorial blend of EU-CSF and C3A. Not a source-standard certification.`
      ),
      h(Text, { style: styles.subSectionTitle }, 'Objective Scorecard'),
      ...buildObjectiveScorecardSection(csiObjectives, 'csl', levelPrefix),
      h(Text, { style: styles.subSectionTitle }, 'Strengths'),
      strengths.length === 0
        ? h(Text, { style: styles.bodyText }, `No objective has reached ${levelPrefix} 3 yet.`)
        : h(View, {}, ...strengths.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            return h(View, { key: obj.objective_id, style: styles.strengthCard },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${levelPrefix} ${obj.csl}, ${pct}%`),
            );
          })),
      h(Text, { style: styles.subSectionTitle }, 'Weaknesses'),
      weaknesses.length === 0
        ? h(Text, { style: styles.bodyText }, 'No significant weaknesses identified.')
        : h(View, {}, ...weaknesses.map(obj => {
            const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
            const topGap = result.csi_composite!.gap_report.find(g => g.objective_id === obj.objective_id);
            return h(View, { key: obj.objective_id, style: styles.weakCard },
              h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — ${levelPrefix} ${obj.csl}, ${pct}%`),
              topGap ? h(Text, { style: styles.cardBody }, `Top gap: ${getQuestionTitle(criteria, topGap.question_id)} (${topGap.question_id})`) : null,
            );
          })),
      ...buildGapSection(result.csi_composite.gap_report, 'CSI Composite'),
      footer,
    ));
  }

  const doc = h(Document, {},
    // Cover page
    h(Page, { size: 'A4', style: styles.coverPage },
      h(View, {},
        h(Text, { style: styles.coverTitle }, 'Cloud Sovereignty\nAssessment Report'),
        h(Text, { style: styles.coverSub }, companyName ?? 'Confidential Assessment'),
        h(Text, { style: styles.coverMeta }, `Date: ${dateStr}`),
        h(Text, { style: styles.coverMeta }, `Framework(s): ${frameworkNames.join(', ')}`),
        country ? h(Text, { style: styles.coverMeta }, `Country: ${country.name}`) : null,
        h(Text, { style: styles.coverMeta }, `Instrument: v${result.instrument_version}`),
        ...coverResults,
        h(Text, { style: styles.coverScopeNote },
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
          'CSI Composite is an editorial framework blending EU-CSF and C3A. Not a source-standard certification.'
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
