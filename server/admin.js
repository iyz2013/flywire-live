import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function createAdmin(settings, { passwordHash = process.env.ADMIN_PASSWORD_HASH, secure = process.env.NODE_ENV === 'production' } = {}) {
  const sessions = new Map(), attempts = new Map();
  const cookie = (value, age) => `flywire_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const reply = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const now = Date.now();
    for (const [key, expires] of sessions) if (expires < now) sessions.delete(key);
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const session = /(?:^|;\s*)flywire_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    try {
      if (req.method === 'GET' && url.pathname === '/api/admin/session') {
        reply(res, sessions.has(session) ? 200 : 401, sessions.has(session) ? settings.read() : { error: 'Sign in to continue.' }); return true;
      }
      if (req.method !== 'POST') { reply(res, 405, { error: 'Method not allowed.' }); return true; }
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const origin = `${secure ? 'https' : 'http'}://${host}`;
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) { reply(res, 403, { error: 'Request not allowed.' }); return true; }
      if (url.pathname !== '/api/admin/login' && !sessions.has(session)) { reply(res, 401, { error: 'Sign in to continue.' }); return true; }
      if (url.pathname === '/api/admin/login') {
        // A global cap also bounds work when clients rotate or spoof IP headers.
        const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
        for (const [key, limit] of [[String(ip), 5], ['global', 60]]) {
          const entry = attempts.get(key) || { count: 0, until: now + 60000 };
          if (entry.count >= limit) { reply(res, 429, { error: 'Too many attempts. Try again in a minute.' }, { 'Retry-After': '60' }); return true; }
          entry.count++; attempts.set(key, entry);
        }
      }
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) { reply(res, 413, { error: 'Request too large.' }); return true; } }
      let data;
      try { data = JSON.parse(body); } catch { reply(res, 400, { error: 'Invalid request.' }); return true; }
      if (url.pathname === '/api/admin/login') {
        if (!passwordHash) { reply(res, 503, { error: 'Admin access is not configured.' }); return true; }
        const [salt, digest] = passwordHash.split(':');
        const expected = Buffer.from(digest, 'hex');
        const actual = scryptSync(typeof data.password === 'string' ? data.password : '', salt, 64);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) { reply(res, 401, { error: 'Incorrect password.' }); return true; }
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('hex'); sessions.set(token, now + 3600000);
        reply(res, 200, settings.read(), { 'Set-Cookie': cookie(token, 3600) }); return true;
      }
      if (url.pathname === '/api/admin/logout') { sessions.delete(session); reply(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); return true; }
      if (url.pathname === '/api/admin/settings') { reply(res, 200, await settings.save(data.homeToken)); return true; }
      reply(res, 404, { error: 'Not found.' }); return true;
    } catch (error) { reply(res, error.status || 500, { error: error.status === 400 ? error.message : 'Could not save settings. Please try again.' }); return true; }
  };
}
