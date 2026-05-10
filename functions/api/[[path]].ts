// Cloudflare Pages Function — proxies /api/* to the standalone Workers service.
// WORKERS_API_URL env var is set in the Pages project dashboard.
// Falls back to localhost for local Pages dev (wrangler pages dev).
interface Env {
  WORKERS_API_URL?: string;
}

export async function onRequest(context: EventContext<Env, string, unknown>) {
  const workersBase = context.env.WORKERS_API_URL ?? 'http://localhost:8787';
  const url = new URL(context.request.url);
  const target = workersBase + url.pathname + url.search;

  return fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
  });
}
