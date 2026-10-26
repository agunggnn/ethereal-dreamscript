#!/usr/bin/env node
// Local Studio server: serves the project folder and lets the Studio save to disk.
// Run with the MCP server so the agent and the browser share the same files:
//   cd mcp && npm run studio   →   http://localhost:4747/Home.dc.html
// Writes: production/realms/<id>.json, <id>.job.json, <id>.<ext> (Realm Builder);
// production/<ep>/episode.json (+ history/ snapshots), session.json (UI state the agent reads), frames/<key>.<ext>
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, realpath, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(process.env.DREAMSCRIPT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = +process.env.PORT || 4747;
const KEEP = 40, EVERY_MS = 120000;
// Only answer to our own host names, so a DNS-rebinding page can't read or write the project. Add a tunnel's host with STUDIO_HOSTS.
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, ...(process.env.STUDIO_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
// Also the allowlist: other file types are never served.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.webm': 'video/webm', '.srt': 'text/plain; charset=utf-8' };

const send = (res, code, body, type = 'application/json', headers = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const json = (res, code, d, headers = {}) => send(res, code, JSON.stringify(d), 'application/json', headers);
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 20e6) bad(new Error('too large')); }); req.on('end', () => ok(d)); req.on('error', bad); });
const etag = (data) => '"' + createHash('sha1').update(data).digest('hex') + '"';
const epDir = (ep) => path.join(ROOT, 'production', ep);
const HIST = /^episode-\d{13}\.json$/;
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

// Copy the current episode.json into history/ (at most every 2 minutes unless forced; keeps the last 40).
async function snapshot(ep, force) {
  const prev = await readFile(path.join(epDir(ep), 'episode.json'), 'utf8').catch(() => null);
  if (!prev) return false;
  const hd = path.join(epDir(ep), 'history');
  await mkdir(hd, { recursive: true });
  const all = (await readdir(hd)).filter((n) => HIST.test(n)).sort();
  const last = all.at(-1);
  if (last && !force && Date.now() - +last.slice(8, 21) < EVERY_MS) return false;
  if (last && (await readFile(path.join(hd, last), 'utf8')) === prev) return false;
  await writeFile(path.join(hd, `episode-${Date.now()}.json`), prev, 'utf8');
  for (const n of all.slice(0, Math.max(0, all.length + 1 - KEEP))) await unlink(path.join(hd, n)).catch(() => {});
  return true;
}

http.createServer(async (req, res) => {
  try {
    if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) return send(res, 403, 'host not allowed', 'text/plain');
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/ping') return json(res, 200, { ok: true, root: ROOT });
    const rm = /^\/api\/(realm|realmimg|realmjob)\/([a-z0-9][a-z0-9-]*)$/.exec(p);
    if (rm) {
      const [, kind, id] = rm, dir = path.join(ROOT, 'production', 'realms');
      await mkdir(dir, { recursive: true });
      if (kind === 'realm' && req.method === 'PUT') { const d = JSON.parse(await body(req)); if (!Array.isArray(d.elements)) return json(res, 400, { error: 'not a realm' }); await writeFile(path.join(dir, id + '.json'), JSON.stringify(d, null, 2) + '\n', 'utf8'); return json(res, 200, { saved: true }); }
      if (kind === 'realmjob' && req.method === 'PUT') { const d = JSON.parse(await body(req)); await writeFile(path.join(dir, id + '.job.json'), JSON.stringify({ ...d, status: 'queued' }, null, 2) + '\n', 'utf8'); return json(res, 200, { queued: true }); }
      if (kind === 'realmjob' && req.method === 'DELETE') { await unlink(path.join(dir, id + '.job.json')).catch(() => {}); return json(res, 200, { deleted: true }); }
      if (kind === 'realmimg' && req.method === 'PUT') {
        const d = /^data:(image\/(png|jpeg|webp));base64,(.+)$/s.exec(await body(req));
        if (!d) return json(res, 400, { error: 'send a PNG, JPEG or WEBP data URL' });
        const name = id + ({ png: '.png', jpeg: '.jpg', webp: '.webp' }[d[2]]);
        await writeFile(path.join(dir, name), Buffer.from(d[3], 'base64'));
        return json(res, 200, { url: `production/realms/${name}` });
      }
      return json(res, 405, { error: 'method not allowed' });
    }
    const m = /^\/api\/(episode|session|history|snapshot|frame)\/([a-z0-9][a-z0-9-]*)(?:\/([\w-]+))?$/.exec(p);
    if (m) {
      const [, kind, ep, key] = m;
      if (kind === 'episode' && req.method === 'PUT') {
        const text = await body(req), d = JSON.parse(text);
        if (!Array.isArray(d.scenes)) return json(res, 400, { error: 'not an episode' });
        const file = path.join(epDir(ep), 'episode.json');
        return await serial(async () => {
          // The Studio sends the ETag of the copy it edited. If the agent saved since then, refuse, so the Studio merges instead of overwriting.
          const cur = await readFile(file).catch(() => null), want = req.headers['if-match'];
          if (want && cur && want !== etag(cur)) return json(res, 409, { error: 'episode.json changed on disk' }, { ETag: etag(cur) });
          await snapshot(ep, false);
          await writeFile(file, text, 'utf8');
          json(res, 200, { saved: true }, { ETag: etag(text) });
        });
      }
      if (kind === 'snapshot' && req.method === 'POST') return json(res, 200, { saved: await snapshot(ep, true) });
      if (kind === 'history' && req.method === 'GET') {
        const names = await readdir(path.join(epDir(ep), 'history')).catch(() => []);
        return json(res, 200, names.filter((n) => HIST.test(n)).sort().reverse().map((name) => ({ name, at: new Date(+name.slice(8, 21)).toISOString() })));
      }
      if (kind === 'session' && req.method === 'PUT') {
        const patch = JSON.parse(await body(req));
        delete patch.agentReview; // only the agent (MCP post_review) writes this
        return await serial(async () => {
          const f = path.join(epDir(ep), 'session.json');
          const cur = JSON.parse((await readFile(f, 'utf8').catch(() => '{}')) || '{}');
          await writeFile(f, JSON.stringify({ ...cur, ...patch, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
          json(res, 200, { saved: true });
        });
      }
      if (kind === 'frame' && req.method === 'PUT' && key) {
        const d = /^data:(image\/(png|jpeg|webp));base64,(.+)$/s.exec(await body(req));
        if (!d) return json(res, 400, { error: 'send a PNG, JPEG or WEBP data URL' });
        const dir = path.join(epDir(ep), 'frames'), name = key + ({ png: '.png', jpeg: '.jpg', webp: '.webp' }[d[2]]);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, name), Buffer.from(d[3], 'base64'));
        return json(res, 200, { url: `production/${ep}/frames/${name}?v=${Date.now()}` });
      }
      return json(res, 405, { error: 'method not allowed' });
    }
    if (p === '/api/complete' && req.method === 'POST') {
      const text = await body(req);
      let payload;
      try { payload = JSON.parse(text || '{}'); } catch { return json(res, 400, { error: 'invalid json' }); }
      const key = payload.apiKey || req.headers['x-api-key'] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const openAiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

      if (key) {
        const model = payload.model || 'gemini-2.5-flash';
        const systemPrompt = payload.system || '';
        const contents = (payload.messages || []).map((msg) => {
          let parts = [];
          if (typeof msg.content === 'string') {
            parts = [{ text: msg.content }];
          } else if (Array.isArray(msg.content)) {
            parts = msg.content.map((pt) => {
              if (pt.type === 'text') return { text: pt.text };
              if (pt.type === 'image' && pt.source) {
                return { inlineData: { mimeType: pt.source.media_type, data: pt.source.data } };
              }
              return { text: JSON.stringify(pt) };
            });
          }
          return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
        });

        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
            contents,
            generationConfig: {
              maxOutputTokens: payload.max_tokens || 4096,
              temperature: 0.7
            }
          })
        });

        const j = await gRes.json();
        if (!gRes.ok) return json(res, gRes.status, { error: (j.error && j.error.message) || `Gemini API HTTP ${gRes.status}` });
        const out = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((pt) => pt.text).join('');
        return json(res, 200, { ok: true, text: out, content: out });
      }

      if (anthropicKey) {
        const aRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: payload.model || 'claude-3-5-sonnet-20241022',
            max_tokens: payload.max_tokens || 4096,
            system: payload.system || undefined,
            messages: (payload.messages || []).map((msg) => ({ role: msg.role, content: msg.content }))
          })
        });
        const j = await aRes.json();
        if (!aRes.ok) return json(res, aRes.status, { error: (j.error && j.error.message) || `Anthropic HTTP ${aRes.status}` });
        const out = (j.content || []).map((c) => c.text || '').join('');
        return json(res, 200, { ok: true, text: out, content: out });
      }

      if (openaiKey || process.env.OPENAI_BASE_URL) {
        const msgs = [];
        if (payload.system) msgs.push({ role: 'system', content: payload.system });
        for (const msg of (payload.messages || [])) msgs.push({ role: msg.role, content: msg.content });
        const oRes = await fetch(`${openAiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(openaiKey ? { 'Authorization': `Bearer ${openaiKey}` } : {})
          },
          body: JSON.stringify({
            model: payload.model || 'gpt-4o',
            messages: msgs,
            max_tokens: payload.max_tokens || 4096
          })
        });
        const j = await oRes.json();
        if (!oRes.ok) return json(res, oRes.status, { error: (j.error && j.error.message) || `OpenAI HTTP ${oRes.status}` });
        const out = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        return json(res, 200, { ok: true, text: out, content: out });
      }

      return json(res, 400, {
        error: 'No AI API key found. Paste your Gemini API key in the studio settings, set GEMINI_API_KEY in your environment, or ask your MCP agent in chat to build the storyboard.'
      });
    }
    const file = await realpath(path.join(ROOT, p === '/' ? 'Home.dc.html' : p)).catch(() => null);
    if (!file || !servable(path.relative(ROOT, file))) return send(res, 404, 'not found', 'text/plain');
    const st = await stat(file);
    if (!st.isFile()) return send(res, 404, 'not found', 'text/plain');
    const data = await readFile(file), ext = path.extname(file).toLowerCase();
    send(res, 200, data, TYPES[ext], ext === '.json' ? { ETag: etag(data) } : {});
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`Dreamscript Studio → http://localhost:${PORT}/Home.dc.html`));
