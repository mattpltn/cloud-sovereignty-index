import type { CriteriaFile, Question } from '../../shared/src/schema.js';
import { resolvePlaceholders } from '../../shared/src/tier-resolution.js';

interface QuestionResult {
  question_id: string; tier: string; value: string;
  points_earned: number; points_possible: number;
  seal_contribution: number; counts_toward_seal: boolean;
}
interface ObjectiveResult {
  objective_id: string; title: string; weight: number;
  seal_level: number; raw_score: number; max_score: number;
  gap: number; questions: QuestionResult[];
}
interface GapItem {
  objective_id: string; question_id: string; tier: string;
  gap_score: number; priority: number;
}
interface AssessmentResult {
  overall_score: number; seal_level: number; variant: string;
  country_code?: string; objectives: ObjectiveResult[];
  gap_report: GapItem[]; assessed_at: string;
}
interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }

const SEAL_LABELS = ['No Sovereignty', 'Minimal Sovereignty', 'Partial Sovereignty', 'Substantial Sovereignty', 'Full Digital Sovereignty'];
const SEAL_COLORS_HEX = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function getQuestionTitle(criteria: CriteriaFile, qid: string): string {
  for (const obj of criteria.objectives) {
    const q = obj.questions.find((q: Question) => q.id === qid);
    if (q) return q.title;
  }
  return qid;
}

function getQuestionMeta(criteria: CriteriaFile, qid: string, tier: string, ctx: { variant: 'EU-CSF' | 'Generalized'; country?: Country }) {
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

function buildNarrative(result: AssessmentResult, criteria: CriteriaFile): string {
  const { overall_score, seal_level, objectives } = result;
  const sealLabel = SEAL_LABELS[seal_level] ?? 'Unknown';
  const bottlenecks = objectives.filter(o => o.seal_level === seal_level && seal_level < 4);
  const strengths = objectives.filter(o => o.seal_level >= 3);

  let text = `This assessment achieved an overall score of ${Math.round(overall_score)}%, corresponding to SEAL level ${seal_level} — ${sealLabel}. `;

  if (seal_level === 4) {
    text += 'All objectives meet the highest sovereignty threshold.';
  } else {
    if (bottlenecks.length > 0) {
      text += `The SEAL level is currently limited by ${bottlenecks.map(o => o.title).join(', ')}, which have not reached the next threshold. `;
    }
    if (strengths.length > 0) {
      text += `Strong performance was observed in ${strengths.map(o => o.title).join(', ')} (SEAL ${Math.min(...strengths.map(o => o.seal_level))}+). `;
    }
    const topGap = result.gap_report[0];
    if (topGap) {
      const title = getQuestionTitle(criteria, topGap.question_id);
      text += `The highest-priority improvement is ${title} (${topGap.question_id}, ${topGap.tier} tier).`;
    }
  }
  return text;
}

export async function buildReportPdf(
  result: AssessmentResult,
  criteria: CriteriaFile,
  companyName?: string,
  country?: Country,
): Promise<Blob> {
  const { Document, Page, Text, View, StyleSheet, pdf } = await import('@react-pdf/renderer');
  const { createElement: h } = await import('react');

  const ctx = { variant: result.variant as 'EU-CSF' | 'Generalized', country };

  const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingHorizontal: 48, paddingVertical: 48 },
    coverPage: { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingHorizontal: 48, paddingVertical: 80, backgroundColor: '#f9fafb' },
    // Cover
    coverTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: '#111827' },
    coverSub: { fontSize: 14, color: '#4b5563', marginBottom: 40 },
    coverMeta: { fontSize: 10, color: '#6b7280', marginBottom: 6 },
    coverSealBox: { marginTop: 32, padding: 20, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    coverSealScore: { fontSize: 36, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
    coverSealLabel: { fontSize: 13, color: '#4b5563' },
    // Sections
    sectionTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4 },
    bodyText: { fontSize: 10, color: '#374151', lineHeight: 1.6, marginBottom: 8 },
    // Table
    tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: 6, borderRadius: 4, marginBottom: 2 },
    tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    tableRowAlt: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#f9fafb' },
    colId: { width: 60, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
    colTitle: { flex: 1, fontSize: 9 },
    colPct: { width: 50, fontSize: 9, textAlign: 'right' },
    colSeal: { width: 60, fontSize: 9, textAlign: 'right' },
    // Cards
    strengthCard: { backgroundColor: '#f0fdf4', borderLeftWidth: 3, borderLeftColor: '#22c55e', padding: 10, marginBottom: 6, borderRadius: 4 },
    weakCard: { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#dc2626', padding: 10, marginBottom: 6, borderRadius: 4 },
    improvCard: { backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: '#f97316', padding: 10, marginBottom: 6, borderRadius: 4 },
    cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3, color: '#111827' },
    cardBody: { fontSize: 9, color: '#4b5563', lineHeight: 1.5 },
    noteBox: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 6, marginTop: 16 },
    footer: { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#9ca3af', flexDirection: 'row', justifyContent: 'space-between' },
  });

  const sealColor = SEAL_COLORS_HEX[result.seal_level] ?? '#6b7280';
  const strengths = result.objectives.filter(o => o.seal_level >= 3);
  const weaknesses = result.objectives.filter(o => o.seal_level <= 1 || (o.seal_level === result.seal_level && result.seal_level < 4));
  const topGaps = result.gap_report.slice(0, 5);
  const narrative = buildNarrative(result, criteria);
  const dateStr = new Date(result.assessed_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  const doc = h(Document, {},
    // ── Cover page ────────────────────────────────────────────────────────────
    h(Page, { size: 'A4', style: styles.coverPage },
      h(View, {},
        h(Text, { style: styles.coverTitle }, 'Cloud Sovereignty\nAssessment Report'),
        h(Text, { style: styles.coverSub }, companyName ? `${companyName}` : 'Confidential Assessment'),
        h(Text, { style: styles.coverMeta }, `Date: ${dateStr}`),
        h(Text, { style: styles.coverMeta }, `Framework: ${result.variant} — EU Cloud Sovereignty Framework v1.2.1 / BSI C5:2020`),
        country && h(Text, { style: styles.coverMeta }, `Country: ${country.name}`),
        h(View, { style: styles.coverSealBox },
          h(Text, { style: { ...styles.coverSealScore, color: sealColor } }, `${Math.round(result.overall_score)}%`),
          h(Text, { style: styles.coverSealLabel }, `SEAL ${result.seal_level} — ${SEAL_LABELS[result.seal_level]}`),
        ),
      ),
      h(View, { style: styles.footer },
        h(Text, {}, 'Cloud Sovereignty Index — Not an official certification'),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),

    // ── Main report page(s) ───────────────────────────────────────────────────
    h(Page, { size: 'A4', style: styles.page },

      // Executive Summary
      h(Text, { style: styles.sectionTitle }, '1. Executive Summary'),
      h(Text, { style: styles.bodyText }, narrative),

      // Objective Scorecard
      h(Text, { style: styles.sectionTitle }, '2. Objective Scorecard'),
      h(View, { style: styles.tableHeader },
        h(Text, { style: styles.colId }, 'ID'),
        h(Text, { style: styles.colTitle }, 'Objective'),
        h(Text, { style: styles.colPct }, 'Score'),
        h(Text, { style: styles.colSeal }, 'SEAL'),
      ),
      ...result.objectives.map((obj, i) => {
        const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
        const color = SEAL_COLORS_HEX[obj.seal_level] ?? '#6b7280';
        return h(View, { key: obj.objective_id, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
          h(Text, { style: { ...styles.colId, color } }, obj.objective_id),
          h(Text, { style: styles.colTitle }, obj.title),
          h(Text, { style: { ...styles.colPct, color } }, `${pct}%`),
          h(Text, { style: { ...styles.colSeal, color } }, `SEAL ${obj.seal_level}`),
        );
      }),

      // Strengths
      h(Text, { style: styles.sectionTitle }, '3. Strengths'),
      strengths.length === 0
        ? h(Text, { style: styles.bodyText }, 'No objective has reached SEAL 3 yet.')
        : h(View, {},
            ...strengths.map(obj => {
              const pct = obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0;
              return h(View, { key: obj.objective_id, style: styles.strengthCard },
                h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — SEAL ${obj.seal_level}, ${pct}%`),
                h(Text, { style: styles.cardBody },
                  obj.questions.filter(q => q.value === 'yes').length + ' of ' + obj.questions.length + ' criteria met.'
                ),
              );
            }),
          ),

      // Weaknesses
      h(Text, { style: styles.sectionTitle }, '4. Weaknesses & Limiting Factors'),
      weaknesses.length === 0
        ? h(Text, { style: styles.bodyText }, 'No significant weaknesses identified.')
        : h(View, {},
            ...weaknesses.map(obj => {
              const topQ = result.gap_report.find(g => g.objective_id === obj.objective_id);
              const topTitle = topQ ? getQuestionTitle(criteria, topQ.question_id) : '';
              return h(View, { key: obj.objective_id, style: styles.weakCard },
                h(Text, { style: styles.cardTitle }, `${obj.title} (${obj.objective_id}) — SEAL ${obj.seal_level}`),
                h(Text, { style: styles.cardBody },
                  `Score: ${obj.max_score > 0 ? Math.round((obj.raw_score / obj.max_score) * 100) : 0}% (${obj.raw_score}/${obj.max_score} points).` +
                  (topTitle ? ` Top gap: ${topTitle} (${topQ?.question_id}).` : '')
                ),
              );
            }),
          ),

      h(View, { style: styles.footer },
        h(Text, {}, 'Cloud Sovereignty Index — Not an official certification'),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),

    // ── Improvement areas page ────────────────────────────────────────────────
    h(Page, { size: 'A4', style: styles.page },
      h(Text, { style: styles.sectionTitle }, '5. Priority Improvement Areas'),
      topGaps.length === 0
        ? h(Text, { style: styles.bodyText }, 'No improvement areas identified.')
        : h(View, {},
            ...topGaps.map((gap, i) => {
              const meta = getQuestionMeta(criteria, gap.question_id, gap.tier, ctx);
              return h(View, { key: i, style: styles.improvCard },
                h(Text, { style: styles.cardTitle }, `#${gap.priority}. ${meta.title} — ${gap.question_id} (${gap.tier})`),
                meta.source && h(Text, { style: { ...styles.cardBody, color: '#9ca3af', marginBottom: 3 } }, `Source: ${meta.source}`),
                meta.supplementary
                  ? h(Text, { style: styles.cardBody }, meta.supplementary.slice(0, 300) + (meta.supplementary.length > 300 ? '…' : ''))
                  : h(Text, { style: styles.cardBody }, 'Answer "yes" to this criterion to improve your sovereignty score.'),
              );
            }),
          ),

      // Methodology note
      h(Text, { style: styles.sectionTitle }, '6. Methodology & Disclaimer'),
      h(View, { style: styles.noteBox },
        h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          'This report is a self-assessment based on the EU Cloud Sovereignty Framework v1.2.1 and BSI C5:2020 criteria. ' +
          'It is not an official certification and has not been verified by an accredited auditor. ' +
          'Results are indicative and based solely on the responses provided.'
        ),
        h(Text, { style: { ...styles.bodyText, marginBottom: 4 } },
          'SEAL levels are determined by the minimum score across all objectives — a single underperforming area caps the overall level. ' +
          'The overall percentage score reflects weighted points earned across all criteria.'
        ),
        h(Text, { style: styles.bodyText },
          'This tool is not affiliated with or endorsed by the German Federal Office for Information Security (BSI) or the European Commission. ' +
          'Published under the MIT license at github.com/mattpltn/cloud-sovereignty-index.'
        ),
      ),

      h(View, { style: styles.footer },
        h(Text, {}, 'Cloud Sovereignty Index — Not an official certification'),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),
  );

  const blob = await pdf(doc).toBlob();
  return blob;
}
