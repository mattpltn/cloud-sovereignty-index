import type { APIRoute } from 'astro';
import criteriaJson from '../../../data/criteria.json';
import countriesJson from '../../../data/countries.json';
import type { CriteriaFile } from '../../../shared/src/schema.js';
import { buildTemplateXlsx } from '../../lib/template-xlsx.js';

export const prerender = false;

type FwKey = 'applies_to_eu_csf' | 'applies_to_c3a' | 'applies_to_csi_composite' | 'applies_to_cada';

const FW_FLAG: Record<string, FwKey> = {
  eu_csf:        'applies_to_eu_csf',
  c3a:           'applies_to_c3a',
  csi_composite: 'applies_to_csi_composite',
  cada:          'applies_to_cada',
};

const FW_LABEL: Record<string, string> = {
  eu_csf:        'EU-CSF v1.2.1',
  c3a:           'C3A v1.0 (BSI)',
  csi_composite: 'CSI Composite',
  cada:          'CADA (COM(2026) 502)',
};

const FW_FILENAME: Record<string, string> = {
  eu_csf:        'eu-csf-assessment-template.xlsx',
  c3a:           'c3a-assessment-template.xlsx',
  csi_composite: 'csi-composite-assessment-template.xlsx',
  cada:          'cada-readiness-template.xlsx',
};

export const GET: APIRoute = async ({ url }) => {
  const fw = url.searchParams.get('fw') ?? '';
  const flagKey = FW_FLAG[fw];
  const label   = FW_LABEL[fw];

  const allCriteria = criteriaJson as unknown as CriteriaFile;

  // Filter to only the framework's questions when a valid fw param is given
  const criteria: CriteriaFile = flagKey
    ? {
        ...allCriteria,
        objectives: allCriteria.objectives
          .map(obj => ({
            ...obj,
            questions: obj.questions.filter(q => (q as any)[flagKey] === true),
          }))
          .filter(obj => obj.questions.length > 0),
      } as unknown as CriteriaFile
    : allCriteria;

  const blob = await buildTemplateXlsx(criteria, countriesJson, label);
  const buffer = await blob.arrayBuffer();
  const filename = FW_FILENAME[fw] ?? 'csi-assessment-template.xlsx';

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // no-store prevents CDN caching so each fw= param gets a fresh dynamic response
      'Cache-Control': 'no-store',
    },
  });
};
