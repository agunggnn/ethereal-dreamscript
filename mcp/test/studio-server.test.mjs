// Starts studio-server.mjs on a random port against a temp copy of the project. Run: cd mcp && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 40000 + Math.floor(Math.random() * 9000);
let root, sibling, server;

// node:http rather than fetch: fetch can't send a custom Host header or a raw ..%2F path.
const request = (urlPath, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers: { Host: `localhost:${PORT}`, ...headers } }, (res) => {
    let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
  });
  req.on('error', reject); req.end(body);
});

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dreamscript-studio-'));
  sibling = root + '-sibling'; // same name prefix as root
  for (const d of ['production/ep01', '.git', 'mcp']) await mkdir(path.join(root, d), { recursive: true });
  await mkdir(sibling);
  await copyFile(path.join(REPO, 'production/ep01/episode.json'), path.join(root, 'production/ep01/episode.json'));
  await writeFile(path.join(root, 'Home.dc.html'), 'home');
  await writeFile(path.join(root, '.git/config'), '[remote]');
  for (const f of ['README.md', 'server.mjs', 'mcp-config.local.json']) await writeFile(path.join(root, 'mcp', f), f);
  await writeFile(path.join(root, 'setup.ps1'), 'ps');
  await writeFile(path.join(sibling, 'secret.txt'), 'secret');
  server = spawn(process.execPath, [path.join(REPO, 'mcp/studio-server.mjs')], { env: { ...process.env, DREAMSCRIPT_ROOT: root, PORT: String(PORT) } });
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', (code) => reject(new Error('studio-server exited with ' + code))); });
});
after(async () => { server?.kill(); await rm(root, { recursive: true, force: true }); await rm(sibling, { recursive: true, force: true }); });

test('serves the pages, episode.json and mcp/README.md', async () => {
  assert.equal((await request('/')).status, 200);
  const ep = await request('/production/ep01/episode.json');
  assert.equal(ep.status, 200);
  assert.match(ep.headers.etag, /^"[0-9a-f]{40}"$/);
  assert.equal((await request('/mcp/README.md')).status, 200);
});

test('does not serve dotfiles, mcp/ internals, other file types or anything outside the project', async () => {
  for (const p of ['/.git/config', '/mcp/server.mjs', '/mcp/mcp-config.local.json', '/MCP/server.mjs', '/setup.ps1', '/..%2F' + path.basename(sibling) + '%2Fsecret.txt', '/..%2F..%2Fetc%2Fhosts']) {
    assert.equal((await request(p)).status, 404, p);
  }
});

test('refuses requests for other host names (DNS rebinding)', async () => {
  assert.equal((await request('/production/ep01/episode.json', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await request('/api/episode/ep01', { method: 'PUT', headers: { Host: 'evil.example' }, body: '{"scenes":[]}' })).status, 403);
});

test('PUT with a stale If-Match is refused, a current one saves', async () => {
  const file = path.join(root, 'production/ep01/episode.json');
  const { headers: { etag } } = await request('/production/ep01/episode.json');
  const ep = JSON.parse(await readFile(file, 'utf8'));
  const stale = await request('/api/episode/ep01', { method: 'PUT', headers: { 'If-Match': '"0000"' }, body: JSON.stringify({ ...ep, title: 'stale' }) });
  assert.equal(stale.status, 409);
  assert.equal(stale.headers.etag, etag);
  assert.notEqual(JSON.parse(await readFile(file, 'utf8')).title, 'stale');
  const fresh = await request('/api/episode/ep01', { method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify({ ...ep, title: 'fresh' }) });
  assert.equal(fresh.status, 200);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).title, 'fresh');
  assert.notEqual(fresh.headers.etag, etag);
});

test('POST /api/complete validates payload and requires key', async () => {
  const bad = await request('/api/complete', { method: 'POST', body: 'invalid-json' });
  assert.equal(bad.status, 400);
  assert.match(bad.body, /invalid json/);

  const noKey = await request('/api/complete', { method: 'POST', body: JSON.stringify({ system: 'hi', messages: [{ role: 'user', content: 'test' }] }) });
  assert.equal(noKey.status, 400);
  assert.match(noKey.body, /No AI API key found/);
});

test('PUT /api/session/ep01 writes session.json and strips client-supplied agentReview', async () => {
  const sFile = path.join(root, 'production/ep01/session.json');
  await writeFile(sFile, JSON.stringify({ step: 1, agentReview: { status: 'pass', summary: 'agent only' } }));
  const res = await request('/api/session/ep01', {
    method: 'PUT',
    body: JSON.stringify({ step: 4, selId: '02', agentReview: { status: 'hacked' } })
  });
  assert.equal(res.status, 200);
  const saved = JSON.parse(await readFile(sFile, 'utf8'));
  assert.equal(saved.step, 4);
  assert.equal(saved.selId, '02');
  assert.equal(saved.agentReview.summary, 'agent only');
});

test('POST /api/snapshot/ep01 and GET /api/history/ep01 list and serve snapshots', async () => {
  const snap = await request('/api/snapshot/ep01', { method: 'POST' });
  assert.equal(snap.status, 200);
  assert.equal(JSON.parse(snap.body).saved, true);

  const hist = await request('/api/history/ep01');
  assert.equal(hist.status, 200);
  const list = JSON.parse(hist.body);
  assert.ok(Array.isArray(list) && list.length >= 1);
  assert.match(list[0].name, /^episode-\d{13}\.json$/);

  const snapGet = await request(`/production/ep01/history/${list[0].name}`);
  assert.equal(snapGet.status, 200);
});

test('PUT /api/frame/ep01/char saves PNG frame and serves it back', async () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const put = await request('/api/frame/ep01/char', {
    method: 'PUT',
    body: dataUrl
  });
  assert.equal(put.status, 200);
  const { url } = JSON.parse(put.body);
  assert.match(url, /^production\/ep01\/frames\/char\.png\?v=\d+$/);

  const getFrame = await request('/production/ep01/frames/char.png');
  assert.equal(getFrame.status, 200);
});

test('PUT /api/realm, /api/realmjob, /api/realmimg save and delete realm artifacts', async () => {
  const putRealm = await request('/api/realm/citadel', {
    method: 'PUT',
    body: JSON.stringify({ id: 'citadel', elements: [{ id: 'S1' }] })
  });
  assert.equal(putRealm.status, 200);

  const putJob = await request('/api/realmjob/citadel', {
    method: 'PUT',
    body: JSON.stringify({ type: 'generate', elements: [{ id: 'S1' }] })
  });
  assert.equal(putJob.status, 200);
  assert.equal(JSON.parse(putJob.body).queued, true);

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const putImg = await request('/api/realmimg/citadel-v1', { method: 'PUT', body: dataUrl });
  assert.equal(putImg.status, 200);
  assert.equal(JSON.parse(putImg.body).url, 'production/realms/citadel-v1.png');

  const delJob = await request('/api/realmjob/citadel', { method: 'DELETE' });
  assert.equal(delJob.status, 200);
});