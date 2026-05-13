import type { APIRoute } from 'astro';
import criteriaJson from '../../../data/criteria.json';
import countriesJson from '../../../data/countries.json';
import type { CriteriaFile } from '../../../shared/src/schema.js';
import { buildTemplateXlsx } from '../../lib/template-xlsx.js';

export const prerender = false;

export const GET: APIRoute = async () => {
  const criteria = criteriaJson as unknown as CriteriaFile;
  const blob = await buildTemplateXlsx(criteria, countriesJson);
  const buffer = await blob.arrayBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="csi-assessment-template.xlsx"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
