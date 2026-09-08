import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { scryptSync } from 'node:crypto';
import { createSettings } from '../server/settings.js';
import { createAdmin } from '../server/admin.js';
import { normalizeCatalog } from '../server/catalog.js';

test('admin authenticates, rejects cross-origin and invalid writes, persists CA and revokes logout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flywire-admin-'));
  const file = join(dir, 'settings.json');
  const settings = createSettings(file);
  const hash = 'test:' + scryptSync('test-password', 'test', 64).toString('hex');
  const admin = createAdmin(settings, { passwordHash: hash, secure: false });
  const server = createServer(async (req, res) => { if (!await admin(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const post = (path, data, from = origin) => fetch(origin + '/api/admin/' + path, { method: 'POST', headers: { Origin: from, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('settings', { homeToken: settings.read().homeToken })).status, 401);
    assert.equal((await post('login', { password: 'wrong' })).status, 401);
    const login = await post('login', { password: 'test-password' });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const token = '0x' + 'a'.repeat(40);
    assert.equal((await post('settings', { homeToken: token }, 'https://other.test')).status, 403);
    assert.equal((await post('settings', { homeToken: 'bad' })).status, 400);
    assert.equal((await post('settings', { homeToken: token })).status, 200);
    assert.equal(createSettings(file).read().homeToken, token);
    assert.equal(normalizeCatalog([], token)[0].address, token);
    assert.equal((await post('logout', {})).status, 200);
    assert.equal((await post('settings', { homeToken: token })).status, 401);
    for (let i = 0; i < 4; i++) await post('login', { password: 'wrong' });
    assert.equal((await post('login', { password: 'wrong' })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
