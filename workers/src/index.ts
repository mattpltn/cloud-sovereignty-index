import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { scoreAssessment } from '../../shared/src/scoring.js';
import criteriaJson from '../../data/criteria.json';
import type { CriteriaFile } from '../../shared/src/schema.js';

const criteria = criteriaJson as unknown as CriteriaFile;

type Bindings = { DB: D1Database; TURNSTILE_SECRET?: string };

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({ origin: '*' }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuidv4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

function now(): string {
  return new Date().toISOString();
}

function expiresAt(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 12);
  return d.toISOString();
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json() as { success: boolean };
  return data.success;
}

// ── POST /api/assessments ─────────────────────────────────────────────────────

const CreateSchema = z.object({
  variant: z.enum(['EU-CSF', 'Generalized']),
  national_country: z.string().optional(),
  service_models: z.array(z.string()).min(1),
  user_role: z.enum(['customer', 'provider', 'auditor']),
  company_name: z.string().optional(),
  c5_attestation: z.enum(['yes', 'no', 'unknown']).optional(),
  turnstile_token: z.string(),
});

app.post('/api/assessments', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

  const data = parsed.data;
  // Fall back to the always-pass test secret when no secret is configured (local dev)
  const secret = c.env.TURNSTILE_SECRET ?? '1x0000000000000000000000000000000AA';
  const valid = await verifyTurnstile(data.turnstile_token, secret);
  if (!valid) return c.json({ error: 'Turnstile verification failed' }, 403);

  const id = uuidv4();
  const ts = now();
  const exp = expiresAt();

  await c.env.DB.prepare(
    `INSERT INTO assessments (id,instrument_version,variant,anchor_bloc,national_country,service_models,user_role,company_name,c5_attestation,created_at,updated_at,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id,
    criteria.instrument_version,
    data.variant,
    data.variant === 'EU-CSF' ? 'EU' : 'non-EU',
    data.national_country ?? null,
    JSON.stringify(data.service_models),
    data.user_role,
    data.company_name ?? null,
    data.c5_attestation ?? 'unknown',
    ts, ts, exp
  ).run();

  return c.json({ id, created_at: ts, expires_at: exp }, 201);
});

// ── GET /api/assessments/:id ──────────────────────────────────────────────────

app.get('/api/assessments/:id', async (c) => {
  const id = c.req.param('id');
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);

  const historyResult = await c.env.DB.prepare(
    'SELECT id, submitted_at, seal_level, overall_score FROM assessment_history WHERE assessment_id = ? ORDER BY submitted_at DESC'
  ).bind(id).all();

  return c.json({ ...row, history: historyResult.results });
});

// ── PATCH /api/assessments/:id ────────────────────────────────────────────────

const PatchSchema = z.object({
  answers: z.record(z.unknown()).optional(),
  share_publicly: z.boolean().optional(),
  company_name: z.string().optional(),
});

app.patch('/api/assessments/:id', async (c) => {
  const id = c.req.param('id');
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const data = parsed.data;
  const ts = now();
  const exp = expiresAt();

  // Reset to draft so the assessment can be re-submitted
  const sets: string[] = ['updated_at = ?', 'expires_at = ?', 'status = ?', 'computed_score = ?', 'finalized_at = ?'];
  const vals: unknown[] = [ts, exp, 'draft', null, null];

  if (data.answers !== undefined) { sets.push('answers = ?'); vals.push(JSON.stringify(data.answers)); }
  if (data.share_publicly !== undefined) { sets.push('share_publicly = ?'); vals.push(data.share_publicly ? 1 : 0); }
  if (data.company_name !== undefined) { sets.push('company_name = ?'); vals.push(data.company_name); }

  vals.push(id);
  await c.env.DB.prepare(`UPDATE assessments SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  return c.json({ updated_at: ts, expires_at: exp });
});

// ── POST /api/assessments/:id/submit ─────────────────────────────────────────

const SubmitSchema = z.object({
  share_publicly: z.boolean(),
});

app.post('/api/assessments/:id/submit', async (c) => {
  const id = c.req.param('id');
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return c.json({ error: 'Not found' }, 404);
  // Allow re-submission (answers may have been updated)

  const answers = JSON.parse(row.answers as string ?? '{}');
  const result = scoreAssessment(answers, criteria, id, {
    variant: row.variant as string,
    country_code: row.national_country as string | undefined,
    scope_ids: JSON.parse(row.service_models as string),
    role: row.user_role as string,
    instrument_version: row.instrument_version as string,
  });

  const ts = now();

  await c.env.DB.prepare(
    `INSERT INTO assessment_history (assessment_id, submitted_at, seal_level, overall_score, answers_snapshot, computed_score)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, ts, result.seal_level, result.overall_score, row.answers, JSON.stringify(result)).run();

  await c.env.DB.prepare(
    `UPDATE assessments SET status='submitted', share_publicly=?, computed_score=?, finalized_at=?, updated_at=? WHERE id=?`
  ).bind(parsed.data.share_publicly ? 1 : 0, JSON.stringify(result), ts, ts, id).run();

  return c.json({ ...row, status: 'submitted', computed_score: result, finalized_at: ts });
});

// ── DELETE /api/assessments/:id ───────────────────────────────────────────────

app.delete('/api/assessments/:id', async (c) => {
  const id = c.req.param('id');
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const row = await c.env.DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);

  await c.env.DB.prepare('DELETE FROM assessments WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// ── GET /api/corpus ───────────────────────────────────────────────────────────

app.get('/api/corpus', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM public_corpus').all();
  return c.json(rows.results ?? []);
});

export default app;
