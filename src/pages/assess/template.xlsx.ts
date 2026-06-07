import type { APIRoute } from 'astro';
import criteriaJson from '../../../data/criteria.json';
import countriesJson from '../../../data/countries.json';
import type { CriteriaFile } from '../../../shared/src/schema.js';
import { buildTemplateXlsx } from '../../lib/template-xlsx.js';

export const prerender = false;

// Framework param → flag name on questions
const FW_FLAG: Record<string, keyof { applies_to_eu_csf: boolean; applies_to_c3a: boolean; applies_to_csi_composite: boolean; applies_to_cada: boolean }> = {
  eu_csf: 'applies_to_eu_csf',
  c3a: 'applies_to_c3a',
  csi_composite: 'applies_to_csi_composite',
  cada: 'applies_to_cada',
};

const FW_FILENAME: Record<string, string> = {
  eu_csf: 'eu-csf-assessment-template.xlsx',
  c3a: 'c3a-assessment-template.xlsx',
  csi_composite: 'csi-assessment-template.xlsx',
  cada: 'cada-assessment-template.xlsx',
};

export const GET: APIRoute = async ({ url }) => {
  const fw = url.searchParams.get('fw') ?? '';
  const flagKey = FW_FLAG[fw];

  let criteria = criteriaJson as unknown as CriteriaFile;

  // Filter criteria to only the framework's questions when a valid fw param is given
  if (flagKey) {
    criteria = {
      ...criteria,
      objectives: criteria.objectives.map(obj => ({
        ...obj,
        questions: obj.questions.filter(q => (q as any)[flagKey] === true),
      })).filter(obj => obj.questions.length > 0),
    } as unknown as CriteriaFile;
  }

  const blob = await buildTemplateXlsx(criteria, countriesJson);
  const buffer = await blob.arrayBuffer();
  const filename = FW_FILENAME[fw] ?? 'csi-assessment-template.xlsx';

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
