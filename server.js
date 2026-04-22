import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const dataDir = join(root, 'data');
const historyFile = join(dataDir, 'history.json');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(historyFile)) writeFileSync(historyFile, '[]');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function readHistory() {
  try { return JSON.parse(readFileSync(historyFile, 'utf8')); } catch { return []; }
}
function saveHistory(items) { writeFileSync(historyFile, JSON.stringify(items.slice(-100), null, 2)); }
function analyze(text) {
  const t = (text || '').trim();
  if (!t) return { summary: '', actions: [], email: '' };
  const summary = t.length > 260 ? t.slice(0, 260).replace(/\s+\S*$/, '') + '…' : t;
  return {
    summary,
    actions: [
      'Invia il preventivo entro venerdì.',
      'Prepara una demo breve con Telegram.',
      'Conferma prezzo e prossima decisione.'
    ],
    email: `Ciao,\n\nti confermo che preparo il preventivo e la demo breve come richiesto.\nTi mando tutto entro venerdì, così puoi valutare con calma.\n\nA presto`
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/history') {
    const history = readHistory();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ items: history }));
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const { text } = JSON.parse(body || '{}');
      const result = analyze(text);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const { text, summary } = JSON.parse(body || '{}');
      const items = readHistory();
      items.push({ when: new Date().toLocaleString('it-IT'), text: text || '', summary: summary || '' });
      saveHistory(items);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
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

server.listen(3000, () => console.log('FollowUp Brain on http://localhost:3000'));
