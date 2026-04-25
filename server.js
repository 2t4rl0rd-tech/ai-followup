import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const index = readFileSync(join(root, 'index.html'));
const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(index);
  }
  res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Contenuto rimosso');
}).listen(port, () => console.log(`Removal placeholder on http://localhost:${port}`));
