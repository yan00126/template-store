import { pathToFileURL } from 'node:url';

function endpoint(value, name) {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials, query or fragment`);
  }
  return url;
}

export function configuration(env) {
  const website = endpoint(env.MONITOR_WEBSITE_URL || env.NEXT_PUBLIC_WEBSITE_URL, 'MONITOR_WEBSITE_URL');
  const supabase = endpoint(env.SUPABASE_URL, 'SUPABASE_URL');
  if (!env.SUPABASE_KEY) throw new Error('SUPABASE_KEY is required');
  const timeout = Number(env.MONITOR_TIMEOUT_MS || 10000);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new Error('MONITOR_TIMEOUT_MS must be between 1 and 30000');
  return { timeout, targets: [
    { name: 'website', url: website.href },
    // Read at most zero rows: verifies the REST/database route without logging product data.
    { name: 'supabase-rest', url: new URL('/rest/v1/Product?select=id&limit=0', supabase).href,
      headers: { apikey: env.SUPABASE_KEY }, jsonArray: true },
  ] };
}

export async function check(target, timeout) {
  const start = performance.now();
  const result = { type: 'check', timestamp: new Date().toISOString(), service: target.name, ok: false };
  try {
    const response = await fetch(target.url, {
      headers: target.headers, redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
    result.status = response.status;
    if (!response.ok) {
      result.error = 'HTTP_ERROR';
      await response.body?.cancel();
    } else if (target.jsonArray) {
      result.ok = Array.isArray(await response.json());
      if (!result.ok) result.error = 'INVALID_RESPONSE';
    } else {
      await response.body?.cancel();
      result.ok = true;
    }
  } catch (error) {
    // Never emit raw errors, response bodies, headers or URLs containing secrets.
    const code = error.cause?.code;
    result.error = error.name === 'TimeoutError' ? 'TIMEOUT'
      : error.name === 'SyntaxError' ? 'INVALID_RESPONSE'
      : ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(code) ? code : 'REQUEST_FAILED';
  }
  return { ...result, duration_ms: Math.round(performance.now() - start) };
}

export async function run(env = process.env, log = (value) => console.log(JSON.stringify(value))) {
  let config;
  try { config = configuration(env); } catch {
    log({ type: 'configuration_error', error: 'Check required URLs, SUPABASE_KEY and MONITOR_TIMEOUT_MS; see monitoring/README.md' });
    return 2;
  }
  const results = await Promise.all(config.targets.map(async (target) => {
    const result = await check(target, config.timeout);
    log(result);
    return result;
  }));
  const failed = results.filter((result) => !result.ok).length;
  log({ type: 'summary', timestamp: new Date().toISOString(), total: results.length, failed, ok: failed === 0 });
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run();
