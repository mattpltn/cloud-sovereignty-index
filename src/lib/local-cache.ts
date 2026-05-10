import { patchAssessment } from './api-client.js';
import { debounce } from './debounce.js';

const PREFIX = 'csi:';

export function cacheKey(id: string): string {
  return `${PREFIX}${id}`;
}

export function readCache(id: string): Record<string, unknown> | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(cacheKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function writeCache(id: string, data: Record<string, unknown>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(cacheKey(id), JSON.stringify(data));
}

export function clearCache(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(cacheKey(id));
}

function flushToServer(id: string, answers: Record<string, unknown>): void {
  patchAssessment(id, { answers }).catch(console.error);
}

const debouncedFlush = debounce(flushToServer, 3000);

export function setAnswer(
  id: string,
  questionId: string,
  answer: { tier: string; value: string; evidence_url?: string; note?: string }
): void {
  const cached = readCache(id) ?? {};
  const answers = (cached.answers as Record<string, unknown>) ?? {};
  answers[questionId] = answer;
  cached.answers = answers;
  writeCache(id, cached);
  debouncedFlush(id, answers);
}

export function flushNow(id: string): void {
  const cached = readCache(id);
  if (!cached?.answers) return;
  flushToServer(id, cached.answers as Record<string, unknown>);
}
