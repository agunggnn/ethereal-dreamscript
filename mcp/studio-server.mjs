#!/usr/bin/env node
// Local Studio server: serves the project folder and lets the Studio save episode.json to disk.
// Run with the MCP server so the agent and the browser share the same files:
//   cd mcp && npm run studio   →   http://localhost:4747/Home.dc.html
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(process.env.DREAMSCRIPT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = +process.env.PORT || 4747;
// Only answer to our own host names, so a DNS-rebinding page can't read or write the project. Add a tunnel's host with STUDIO_HOSTS.
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, ...(process.env.STUDIO_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
// Also the allowlist: other file types are never served.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.srt': 'text/plain; charset=utf-8' };

const send = (res, code, body, type = 'application/json', headers = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 20e6) bad(new Error('too large')); }); req.on('end', () => ok(d)); req.on('error', bad); });
const etag = (data) => '"' + createHash('sha1').update(data).digest('hex') + '"';
// rel is relative to ROOT after realpath, so case tricks, short names and symlinks are already resolved.
// Never served: anything outside ROOT, dotfiles and dot-folders (.git), and mcp/ except its README (server code, local config, node_modules).
const servable = (rel) => {
  const parts = rel.split(path.sep);
  if (!rel || parts[0] === '..' || path.isAbsolute(rel) || parts.some((p) => p.startsWith('.'))) return false;
  if (parts[0].toLowerCase() === 'mcp' && rel.toLowerCase() !== path.join('mcp', 'readme.md')) return false;
  return !!TYPES[path.extname(rel).toLowerCase()];
};
let saving = Promise.resolve();
const serial = (fn) => { const run = saving.then(fn); saving = run.catch(() => {}); return run; };

http.createServer(async (req, res) => {
  try {
    if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) return send(res, 403, 'host not allowed', 'text/plain');
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/ping') return send(res, 200, JSON.stringify({ ok: true, root: ROOT }));
    const m = /^\/api\/episode\/([\w-]+)$/.exec(p);
    if (m && req.method === 'PUT') {
      const text = await body(req), ep = JSON.parse(text);
      if (!Array.isArray(ep.scenes)) return send(res, 400, JSON.stringify({ error: 'not an episode' }));
      const file = path.join(ROOT, 'production', m[1], 'episode.json');
      return await serial(async () => {
        // The Studio sends the ETag of the copy it edited. If the agent saved since then, refuse, so the Studio merges instead of overwriting.
        const cur = await readFile(file).catch(() => null), want = req.headers['if-match'];
        if (want && cur && want !== etag(cur)) return send(res, 409, JSON.stringify({ error: 'episode.json changed on disk' }), 'application/json', { ETag: etag(cur) });
        await writeFile(file, text, 'utf8');
        send(res, 200, JSON.stringify({ saved: true }), 'application/json', { ETag: etag(text) });
      });
    }
    const file = await realpath(path.join(ROOT, p === '/' ? 'Home.dc.html' : p)).catch(() => null);
    if (!file || !servable(path.relative(ROOT, file))) return send(res, 404, 'not found', 'text/plain');
    const st = await stat(file);
    if (!st.isFile()) return send(res, 404, 'not found', 'text/plain');
    const data = await readFile(file), ext = path.extname(file).toLowerCase();
    send(res, 200, data, TYPES[ext], ext === '.json' ? { ETag: etag(data) } : {});
  } catch (e) { send(res, 500, JSON.stringify({ error: String(e.message || e) })); }
}).listen(PORT, '127.0.0.1', () => console.log(`Dreamscript Studio → http://localhost:${PORT}/Home.dc.html`));
