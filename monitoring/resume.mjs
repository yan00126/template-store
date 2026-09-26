import { pathToFileURL } from 'node:url';

export async function resume(env = process.env, log = value => console.log(JSON.stringify(value)), request = fetch) {
  const ref = env.SUPABASE_PROJECT_REF;
  const token = env.SUPABASE_ACCESS_TOKEN;
  const emit = value => log({ timestamp: new Date().toISOString(), service: 'supabase-resume', ...value });
  if (!/^[a-z]{20}$/.test(ref || '') || !token || !['true', 'false'].includes(env.SUPABASE_AUTO_RESUME || 'false')) {
    emit({ error: 'INVALID_CONFIG', required: 'SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, SUPABASE_AUTO_RESUME=true|false' });
    return 2;
  }
  const url = `https://api.supabase.com/v1/projects/${ref}`;
  async function call(method, suffix = '') {
    return request(url + suffix, { method, headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  }
  let phase = 'status';
  try {
    const response = await call('GET');
    if (!response.ok) {
      await response.body?.cancel();
      emit({ phase, error: 'HTTP_ERROR', status: response.status });
      return 1;
    }
    const project = await response.json();
    if ((project.ref || project.id) !== ref || typeof project.status !== 'string') {
      emit({ error: 'INVALID_PROJECT_RESPONSE' });
      return 1;
    }
    const status = project.status;
    if (status === 'ACTIVE_HEALTHY') { emit({ status, action: 'none' }); return 0; }
    if (status !== 'INACTIVE') {
      emit({ status: /^[A-Z_]+$/.test(status) ? status : 'UNKNOWN', action: 'none', message: 'Not paused; no restore attempted' });
      return 1;
    }
    if (env.SUPABASE_AUTO_RESUME !== 'true') { emit({ status, action: 'dry_run' }); return 0; }
    phase = 'restore';
    const restored = await call('POST', '/restore');
    await restored.body?.cancel();
    if (!restored.ok) { emit({ phase, error: 'HTTP_ERROR', status: restored.status }); return 1; }
    // Acceptance is not completion. The next scheduled run verifies the state.
    emit({ status, action: 'restore_requested', http_status: restored.status, message: 'Next scheduled run will verify recovery' });
    return 0;
  } catch (error) {
    emit({ phase, error: error.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED', outcome_unknown: phase === 'restore' });
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await resume();
