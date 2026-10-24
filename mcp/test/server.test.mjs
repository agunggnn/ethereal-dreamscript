// Boots server.mjs over stdio against a temp copy of the project. Run: cd mcp && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
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
const call = (name, args) => client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));

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

test('lists the 14 tools', async () => {
  assert.equal((await client.listTools()).tools.length, 14);
});

test('update_scene rejects a caption over 6 words', async () => {
  const r = await call('update_scene', { id: 's01', onScreen: 'one two three four five six seven' });
  assert.equal(r.isError, true);
  assert.equal((await episode()).scenes[0].onScreen, 'REAL OR FAKE?');
});

test('update_scene cannot set a verdict', async () => {
  await call('update_scene', { id: 'm01', verdict: 'confirmed', edit: 'note' });
  assert.equal((await episode()).scenes.find((s) => s.id === 'm01').verdict, 'pending');
});

test('validate_episode flags missing footage', async () => {
  const r = JSON.parse((await call('validate_episode', { cut: 'shorts' })).content[0].text);
  assert.ok(r.issues.includes('sh1: missing footage/sh1.mp4'));
});

test('parallel edits to different scenes are all saved', async () => {
  const ids = ['s01', 's02', 's05', 's08', 's09'];
  await Promise.all(ids.map((id) => call('update_scene', { id, narration: 'parallel ' + id })));
  const ep = await episode();
  for (const id of ids) assert.equal(ep.scenes.find((s) => s.id === id).narration, 'parallel ' + id);
});

test('episode argument cannot leave production/', async () => {
  // A real episode at <root>/x, which "../x" would reach.
  await mkdir(path.join(root, 'x'));
  await copyFile(path.join(root, 'production/ep01/episode.json'), path.join(root, 'x/episode.json'));
  for (const bad of ['../x', '..\\x', 'ep01/../../x']) {
    const r = await call('set_bgm', { episode: bad, on: false });
    assert.equal(r.isError, true, bad);
  }
  assert.equal(JSON.parse(await readFile(path.join(root, 'x/episode.json'), 'utf8')).bgm.on, undefined);
  assert.equal(existsSync(path.join(root, 'x/activity.json')), false);
});
