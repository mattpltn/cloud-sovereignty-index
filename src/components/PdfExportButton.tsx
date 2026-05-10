import { useState } from 'react';
import type { CriteriaFile } from '../../shared/src/schema.js';

interface Country { code: string; name: string; adj?: string; national_admin_label?: string; emergency_regime?: string }

interface Props {
  result: Record<string, unknown>;
  criteria: CriteriaFile;
  companyName?: string;
  country?: Country;
}

export default function PdfExportButton({ result, criteria, companyName, country }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const { buildReportPdf } = await import('../lib/report-pdf.js');
      const blob = await buildReportPdf(result as Parameters<typeof buildReportPdf>[0], criteria, companyName, country);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = companyName ? companyName.toLowerCase().replace(/\s+/g, '-') : 'assessment';
      a.download = `csi-report-${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF: ' + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
    >
      {loading ? 'Generating…' : 'Download PDF report'}
    </button>
  );
}
