import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const dataDir = join(root, 'data');
const historyFile = join(dataDir, 'history.json');
const usersFile = join(dataDir, 'users.json');
const sessionsFile = join(dataDir, 'sessions.json');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
for (const f of [historyFile, usersFile, sessionsFile]) if (!existsSync(f)) writeFileSync(f, '[]');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const secret = process.env.SESSION_SECRET || 'followup-brain-secret';
function readJson(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; } }
function saveJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
}
function token() { return crypto.randomBytes(24).toString('hex'); }
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').filter(Boolean).map(v => {
    const i = v.indexOf('='); return [decodeURIComponent(v.slice(0, i).trim()), decodeURIComponent(v.slice(i + 1).trim())];
  }));
}
function currentUser(req) {
  const sid = parseCookies(req).fb_sid;
  if (!sid) return null;
  const sessions = readJson(sessionsFile);
  const s = sessions.find(x => x.sid === sid && x.expires > Date.now());
  if (!s) return null;
  const users = readJson(usersFile);
  return users.find(u => u.id === s.userId) || null;
}
function readHistory() { return readJson(historyFile); }
function saveHistory(items) { saveJson(historyFile, items.slice(-100)); }
function analyze(text) {
  const t = (text || '').trim();
  if (!t) return { summary: '', actions: [], email: '' };
  const summary = t.length > 260 ? t.slice(0, 260).replace(/\s+\S*$/, '') + '…' : t;
  return {
    summary,
    actions: ['Invia il preventivo entro venerdì.', 'Prepara una demo breve con Telegram.', 'Conferma prezzo e prossima decisione.'],
    email: `Ciao,\n\nti confermo che preparo il preventivo e la demo breve come richiesto.\nTi mando tutto entro venerdì, così puoi valutare con calma.\n\nA presto`
  };
}
async function readBody(req) {
  return await new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const user = currentUser(req);

  if (req.method === 'POST' && url.pathname === '/api/register') {
    const { email, password } = await readBody(req);
    if (!email || !password) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: 'missing fields' })); }
    const users = readJson(usersFile);
    if (users.find(u => u.email === email)) { res.writeHead(409, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: 'user exists' })); }
    const id = crypto.randomUUID();
    users.push({ id, email, passwordHash: hashPassword(password), createdAt: Date.now() });
    saveJson(usersFile, users);
    const sid = token();
    const sessions = readJson(sessionsFile);
    sessions.push({ sid, userId: id, expires: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    saveJson(sessionsFile, sessions);
    res.writeHead(200, { 'Content-Type':'application/json', 'Set-Cookie': `fb_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
    return res.end(JSON.stringify({ ok: true, email }));
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const { email, password } = await readBody(req);
    const users = readJson(usersFile);
    const u = users.find(x => x.email === email);
    if (!u || !verifyPassword(password || '', u.passwordHash)) { res.writeHead(401, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: 'invalid credentials' })); }
    const sid = token();
    const sessions = readJson(sessionsFile);
    sessions.push({ sid, userId: u.id, expires: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    saveJson(sessionsFile, sessions);
    res.writeHead(200, { 'Content-Type':'application/json', 'Set-Cookie': `fb_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
    return res.end(JSON.stringify({ ok: true, email: u.email }));
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const sid = parseCookies(req).fb_sid;
    if (sid) {
      const sessions = readJson(sessionsFile).filter(x => x.sid !== sid);
      saveJson(sessionsFile, sessions);
    }
    res.writeHead(200, { 'Content-Type':'application/json', 'Set-Cookie': 'fb_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify({ user: user ? { email: user.email } : null }));
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    const history = readHistory().filter(x => !user || x.userId === user.id);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ items: history }));
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const { text } = await readBody(req);
    const result = analyze(text);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(result));
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    if (!user) { res.writeHead(401, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: 'unauthorized' })); }
    const { text, summary } = await readBody(req);
    const items = readHistory();
    items.push({ userId: user.id, when: new Date().toLocaleString('it-IT'), text: text || '', summary: summary || '' });
    saveHistory(items);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true }));
  }

  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = join(root, pathname.slice(1));
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`FollowUp Brain on http://localhost:${port}`));
