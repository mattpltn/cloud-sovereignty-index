const BASE = '/api';

export async function createAssessment(payload: {
  variant: string;
  national_country?: string;
  service_models: string[];
  user_role: string;
  company_name?: string;
  turnstile_token: string;
}): Promise<{ id: string; created_at: string; expires_at: string }> {
  const res = await fetch(`${BASE}/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  return res.json();
}

export async function getAssessment(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/assessments/${id}`);
  if (!res.ok) throw new Error(`Get failed: ${res.status}`);
  return res.json();
}

export async function patchAssessment(
  id: string,
  data: { answers?: Record<string, unknown>; share_publicly?: boolean; company_name?: string }
): Promise<{ updated_at: string; expires_at: string }> {
  const res = await fetch(`${BASE}/assessments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Patch failed: ${res.status}`);
  return res.json();
}

export async function submitAssessment(
  id: string,
  sharePublicly: boolean
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/assessments/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ share_publicly: sharePublicly }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  return res.json();
}

export async function deleteAssessment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/assessments/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function getCorpus(): Promise<unknown[]> {
  const res = await fetch(`${BASE}/corpus`);
  if (!res.ok) throw new Error(`Corpus failed: ${res.status}`);
  return res.json();
}
