import type { APIRoute } from 'astro';

export const ALL: APIRoute = async (context) => {
  // On Cloudflare, runtime env vars come from locals.runtime.env
  // On local Node dev, fall back to process.env (Vite proxy handles browser requests anyway)
  const runtime = (context.locals as { runtime?: { env?: { WORKERS_API_URL?: string } } }).runtime;
  const workersBase =
    runtime?.env?.WORKERS_API_URL ??
    process.env.WORKERS_API_URL ??
    'http://localhost:8787';

  const url = new URL(context.request.url);
  const target = workersBase + url.pathname + url.search;

  return fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
  });
};
