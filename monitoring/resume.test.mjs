import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resume } from './resume.mjs';
const ref = 'brtdiatgxjrwjkzejhbq';
const env = { SUPABASE_PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: 'secret-test', SUPABASE_AUTO_RESUME: 'true' };
for (const status of ['ACTIVE_HEALTHY', 'INACTIVE', 'RESTORING', 'COMING_UP', 'GOING_DOWN', 'ACTIVE_UNHEALTHY', 'UNKNOWN']) {
  test(`only INACTIVE triggers restore: ${status}`, async () => {
    const calls = [], logs = [];
    const result = await resume(env, x => logs.push(x), async (url, options) => {
      calls.push(options.method);
      assert.equal(options.headers.Authorization, 'Bearer secret-test');
      assert.equal(options.redirect, 'error');
      assert.equal(url, `https://api.supabase.com/v1/projects/${ref}${options.method === 'POST' ? '/restore' : ''}`);
      return Response.json(options.method === 'GET' ? { ref, status } : {});
    });
    assert.deepEqual(calls, status === 'INACTIVE' ? ['GET', 'POST'] : ['GET']);
    assert.equal(result, ['ACTIVE_HEALTHY', 'INACTIVE'].includes(status) ? 0 : 1);
    assert.equal(JSON.stringify(logs).includes('secret-test'), false);
  });
}
test('dry run, invalid identity, auth failure, rate limit and ambiguous restore', async () => {
  for (const mode of ['dry', 'identity', '401', '429', 'timeout']) {
    let posts = 0;
    const logs = [];
    const result = await resume({ ...env, SUPABASE_AUTO_RESUME: mode === 'dry' ? 'false' : 'true' }, x => logs.push(x), async (_url, options) => {
      if (options.method === 'POST') { posts++; throw new DOMException('secret-test', 'TimeoutError'); }
      if (['401', '429'].includes(mode)) return new Response('secret-test', { status: Number(mode) });
      return Response.json({ ref: mode === 'identity' ? 'other' : ref, status: 'INACTIVE' });
    });
    assert.equal(posts, mode === 'timeout' ? 1 : 0);
    assert.equal(result, mode === 'dry' ? 0 : 1);
    assert.equal(JSON.stringify(logs).includes('secret-test'), false);
    if (mode === 'timeout') assert.equal(logs[0].outcome_unknown, true);
  }
  assert.equal(await resume({}, () => {}, () => { throw Error('must not call'); }), 2);
});
