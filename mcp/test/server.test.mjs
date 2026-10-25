// Boots server.mjs over stdio against a temp copy of the project. Run: cd mcp && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let root, client;
const episode = async () => JSON.parse(await readFile(path.join(root, 'production/ep01/episode.json'), 'utf8'));
// Invalid arguments come back as an error result or a thrown error depending on the SDK version.
const call = (name, args = {}) => client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dreamscript-mcp-'));
  await mkdir(path.join(root, 'production/ep01'), { recursive: true });
  await mkdir(path.join(root, 'templates'));
  await copyFile(path.join(REPO, 'production/ep01/episode.json'), path.join(root, 'production/ep01/episode.json'));
  for (const f of ['niches.json', 'voices.json']) await copyFile(path.join(REPO, 'templates', f), path.join(root, 'templates', f));
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp/server.mjs')], env: { ...process.env, DREAMSCRIPT_ROOT: root } }));
});
after(async () => { await client?.close(); await rm(root, { recursive: true, force: true }); });

test('lists the 24 tools and guide_episode prompt', async () => {
  assert.equal((await client.listTools()).tools.length, 24);
  const prompts = await client.listPrompts();
  assert.ok(prompts.prompts.some((p) => p.name === 'guide_episode'));
});

test('context guard refuses write tools before get_brief, then allows after get_brief', async () => {
  const beforeBrief = await call('update_scene', { id: 's01', narration: 'blocked' });
  assert.equal(beforeBrief.isError, true);
  assert.match(beforeBrief.content[0].text, /get_brief/);

  const brief = JSON.parse((await call('get_brief')).content[0].text);
  assert.ok(brief.episode);
  assert.equal(brief.next, 'Call check_job, fix what is yours, check_job again, then post_review.');
});

test('update_scene rejects a caption over 6 words and snapshots history', async () => {
  const r = await call('update_scene', { id: 's01', onScreen: 'one two three four five six seven' });
  assert.equal(r.isError, true);
  assert.equal((await episode()).scenes[0].onScreen, 'REAL OR FAKE?');
});

test('update_scene cannot set a verdict', async () => {
  await call('update_scene', { id: 'm01', verdict: 'confirmed', edit: 'note' });
  assert.equal((await episode()).scenes.find((s) => s.id === 'm01').verdict, 'pending');
  assert.equal(existsSync(path.join(root, 'production/ep01/history')), true);
});

test('validate_episode and check_job flag missing footage and owner attribution', async () => {
  const r = JSON.parse((await call('validate_episode', { cut: 'shorts' })).content[0].text);
  assert.ok(r.issues.includes('sh1: missing footage/sh1.mp4'));

  const cj = JSON.parse((await call('check_job', { cut: 'shorts' })).content[0].text);
  assert.ok(Array.isArray(cj.issues));
  assert.ok(cj.agentCanFix > 0);
  assert.ok(cj.needsCreator.length > 0);
});

test('parallel edits to different scenes are all saved', async () => {
  const ids = ['s01', 's02', 's05', 's08', 's09'];
  await Promise.all(ids.map((id) => call('update_scene', { id, narration: 'parallel ' + id })));
  const ep = await episode();
  for (const id of ids) assert.equal(ep.scenes.find((s) => s.id === id).narration, 'parallel ' + id);
});

test('image job lifecycle: list_image_jobs, start_image_job, submit_image, fail_image_job', async () => {
  const ep = await episode();
  ep.frames = { char: { status: 'queued', engine: 'agent', prompt: 'char sheet', width: 1280, height: 720, aspect: '16:9', queuedAt: new Date().toISOString() } };
  ep.scenes[0].frame = { status: 'queued', engine: 'agent', prompt: 'scene 1', width: 1280, height: 720, aspect: '16:9', queuedAt: new Date().toISOString() };
  await writeFile(path.join(root, 'production/ep01/episode.json'), JSON.stringify(ep, null, 2) + '\n', 'utf8');
  await call('get_brief');

  const jobs = JSON.parse((await call('list_image_jobs')).content[0].text);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].key, 'char'); // char sheet sorted first

  const started = JSON.parse((await call('start_image_job', { key: 'char', note: 'Rendering turnaround' })).content[0].text);
  assert.equal(started.status, 'working');

  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const submitted = JSON.parse((await call('submit_image', { key: 'char', base64: pngBase64, mime: 'image/png', model: 'gemini-2.5-flash-image' })).content[0].text);
  assert.equal(submitted.status, 'review');
  assert.equal(existsSync(path.join(root, 'production/ep01/frames/char.png')), true);

  const failed = JSON.parse((await call('fail_image_job', { key: 's01', error: 'Test failure' })).content[0].text);
  assert.equal(failed.status, 'error');
});

test('post_review writes agentReview to session.json', async () => {
  const rev = JSON.parse((await call('post_review', { summary: 'All direction lines filled.', items: [{ scene: 's01', text: 'Updated hook' }], next: 'Record gameplay' })).content[0].text);
  assert.equal(rev.summary, 'All direction lines filled.');
  const sess = JSON.parse(await readFile(path.join(root, 'production/ep01/session.json'), 'utf8'));
  assert.equal(sess.agentReview.next, 'Record gameplay');
});

test('episode argument cannot leave production/', async () => {
  await mkdir(path.join(root, 'x'));
  await copyFile(path.join(REPO, 'production/ep01/episode.json'), path.join(root, 'x/episode.json'));
  for (const bad of ['../x', '..\\x', 'ep01/../../x']) {
    const r = await call('set_bgm', { episode: bad, on: false });
    assert.equal(r.isError, true, bad);
  }
  assert.equal(JSON.parse(await readFile(path.join(root, 'x/episode.json'), 'utf8')).bgm.on, undefined);
  assert.equal(existsSync(path.join(root, 'x/activity.json')), false);
});

test('realm job lifecycle: list_realm_jobs, update_realm_job, finish_realm_job without get_brief', async () => {
  const rd = path.join(root, 'production/realms');
  await mkdir(rd, { recursive: true });
  await writeFile(path.join(rd, 'sky-citadel.job.json'), JSON.stringify({
    type: 'generate',
    status: 'queued',
    prompt: 'Floating sky citadel',
    elements: [
      { id: 'S1', label: 'Citadel', box: [0.2, 0.1, 0.6, 0.5], required: true },
      { id: 'S2', label: 'Waterfall', box: [0.4, 0.5, 0.2, 0.4], required: true }
    ]
  }, null, 2));

  const jobs = JSON.parse((await call('list_realm_jobs')).content[0].text);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'sky-citadel');

  const upd = JSON.parse((await call('update_realm_job', { id: 'sky-citadel', note: 'Painting citadel' })).content[0].text);
  assert.equal(upd.note, 'Painting citadel');

  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const badFinish = await call('finish_realm_job', {
    id: 'sky-citadel',
    base64: pngBase64,
    check: { S1: { present: true, box: [0.2, 0.1, 0.6, 0.5] } }
  });
  assert.equal(badFinish.isError, true);
  assert.match(badFinish.content[0].text, /Missing: S2/);

  const okFinish = JSON.parse((await call('finish_realm_job', {
    id: 'sky-citadel',
    base64: pngBase64,
    model: 'gemini-2.5-flash-image',
    check: {
      S1: { present: true, box: [0.2, 0.1, 0.6, 0.5], note: 'clear' },
      S2: { present: true, box: [0.4, 0.5, 0.2, 0.4], note: 'clear' }
    }
  })).content[0].text);
  assert.equal(okFinish.image, 'production/realms/sky-citadel.png');
  assert.deepEqual(okFinish.absent, []);
});