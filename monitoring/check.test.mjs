import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { check, run } from './check.mjs';

test('HTTP outcomes, timeout, JSON validation, secret handling and exit codes', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') return;
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); return res.end(); }
    if (req.url === '/fail') { res.writeHead(503); return res.end('private error'); }
    if (req.url.startsWith('/rest/v1/Product')) {
      assert.equal(req.headers.apikey, 'test-secret');
      assert.equal(req.url, '/rest/v1/Product?select=id&limit=0');
      return res.end('[]');
    }
    res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await check({ name: 'ok', url: base }, 1000)).ok, true);
    assert.equal((await check({ name: 'fail', url: base + '/fail' }, 1000)).status, 503);
    assert.equal((await check({ name: 'slow', url: base + '/slow' }, 30)).error, 'TIMEOUT');
    assert.equal((await check({ name: 'redirect', url: base + '/redirect' }, 1000)).ok, false);
    assert.equal((await check({ name: 'json', url: base, jsonArray: true }, 1000)).error, 'INVALID_RESPONSE');
    const logs = [];
    const env = { MONITOR_WEBSITE_URL: base, SUPABASE_URL: base, SUPABASE_KEY: 'test-secret' };
    assert.equal(await run(env, x => logs.push(x)), 0);
    assert.equal(await run({ ...env, MONITOR_WEBSITE_URL: base + '/fail' }, x => logs.push(x)), 1);
    assert.equal(await run({}, x => logs.push(x)), 2);
    assert.equal(await run({ ...env, MONITOR_TIMEOUT_MS: '-1' }, x => logs.push(x)), 2);
    assert.equal(JSON.stringify(logs).includes('test-secret'), false);
    assert.equal(JSON.stringify(logs).includes('private error'), false);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
