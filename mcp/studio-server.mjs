#!/usr/bin/env node
// Local Studio server: serves the project folder and lets the Studio save episode.json to disk.
// Run with the MCP server so the agent and the browser share the same files:
//   cd mcp && npm run studio   →   http://localhost:4747/Home.dc.html
import http from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DREAMSCRIPT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 4747;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.webm': 'video/webm', '.srt': 'text/plain; charset=utf-8' };

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 20e6) bad(new Error('too large')); }); req.on('end', () => ok(d)); req.on('error', bad); });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/ping') return send(res, 200, JSON.stringify({ ok: true, root: ROOT }));
    const m = /^\/api\/episode\/([\w-]+)$/.exec(p);
    if (m && req.method === 'PUT') {
      const text = await body(req), ep = JSON.parse(text);
      if (!Array.isArray(ep.scenes)) return send(res, 400, JSON.stringify({ error: 'not an episode' }));
      await writeFile(path.join(ROOT, 'production', m[1], 'episode.json'), text, 'utf8');
      return send(res, 200, JSON.stringify({ saved: true }));
    }
    const file = path.join(ROOT, p === '/' ? 'Home.dc.html' : p);
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, await readFile(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) { send(res, 500, JSON.stringify({ error: String(e.message || e) })); }
}).listen(PORT, '127.0.0.1', () => console.log(`Dreamscript Studio → http://localhost:${PORT}/Home.dc.html`));
