#!/usr/bin/env node
// Dreamscript MCP server: lets any MCP client (Claude Code, Codex, Claude Desktop, Cursor)
// read templates and voices, edit production/<episode>/episode.json, and synthesize narration with edge-tts.
// Agents can't set verdicts. That stays a human decision after footage review.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DREAMSCRIPT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_TTS = process.env.EDGE_TTS_BIN || 'edge-tts';
const SFX = ['none', 'sub_drop', 'whoosh_cinematic', 'whoosh_fast', 'pop', 'hit', 'blip', 'mouse_click'];
const RATES = ['-10%', '-5%', '+0%', '+5%', '+10%'];

const P = (...p) => path.join(ROOT, ...p);
const epPath = (ep) => P('production', ep, 'episode.json');
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const writeJson = (p, d) => writeFile(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const words = (s = '') => s.trim().split(/\s+/).filter((w) => w && w !== '·').length;
const secs = (tc = '') => { const m = /(\d+):(\d+)\D+(\d+):(\d+)/.exec(tc); return m ? (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]) : 0; };
const cutOf = (ep, cut) => (cut === 'shorts' ? ep.shorts.scenes : ep.scenes);
const allScenes = (ep) => [...ep.scenes, ...ep.shorts.scenes];
const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });
const episodeArg = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'Episode must be a folder name like ep01').default('ep01').describe('Episode folder under production/');
const cutArg = z.enum(['longform', 'shorts']).optional().describe('Defaults to the episode template');

// Clients can run tool calls in parallel. Queue every read-modify-write per file so one edit can't overwrite another.
const queues = new Map();
const serial = (key, fn) => { const run = (queues.get(key) || Promise.resolve()).then(fn); queues.set(key, run.catch(() => {})); return run; };
const readEpisode = (episode) => serial(epPath(episode), () => readJson(epPath(episode)));
// fn edits the episode in place and returns a tool result; nothing is written if it returns null or an error.
const editEpisode = (episode, fn) => serial(epPath(episode), async () => {
  const f = epPath(episode), ep = await readJson(f), res = await fn(ep);
  if (res && !res.isError) await writeJson(f, ep);
  return res;
});

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`${cmd} not found. Install with: pip install edge-tts (${e.message})`)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited with ${code}`))));
  });
}
const srtEnd = (srt) => {
  let max = 0;
  for (const m of srt.matchAll(/(\d\d):(\d\d):(\d\d)[,.](\d{3})/g)) max = Math.max(max, +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000);
  return Math.round(max * 100) / 100;
};

const server = new McpServer({ name: 'dreamscript', version: '0.2.0' });

// Every call is appended to production/<ep>/activity.json so the Studio (live mode) can show what the agent is doing.
const READS = new Set(['list_templates', 'get_template', 'list_voices', 'get_episode', 'list_scenes', 'validate_episode', 'list_notes']);
async function logActivity(episode, name, args, res) {
  const file = P('production', episode, 'activity.json');
  await serial(file, async () => {
    const log = (await exists(file)) ? await readJson(file) : [];
    const { episode: _e, ...rest } = args || {};
    const detail = name === 'update_scene' ? rest.id + ': ' + Object.keys(rest).filter((k) => k !== 'id').join(', ') : JSON.stringify(rest).slice(0, 90);
    log.push({ at: new Date().toISOString(), by: 'agent', tool: name, kind: READS.has(name) ? 'read' : 'write', scene: rest.id || null, detail: detail === '{}' ? '' : detail, error: !!(res && res.isError) });
    await writeJson(file, log.slice(-200));
  }).catch(() => {});
}
const tool = (name, desc, shape, fn) => server.tool(name, desc, shape, async (args) => { const res = await fn(args); await logActivity((args && args.episode) || 'ep01', name, args, res); return res; });

tool('list_templates', 'List the niche channel templates (Roblox Horror, Kids Story, Manhwa Recap, JDM Cars, Fleet Formation, News Brief).', {},
  async () => { const n = await readJson(P('templates', 'niches.json')); return ok(n.templates.map((t) => ({ id: t.id, label: t.label, concept: t.concept, voice: t.voice.id }))); });

tool('get_template', 'Full template: concept, audience, hook patterns, structure, subject lock, visual, motion, voice, sfx, music, thumbnail, titles, benchmark, compliance.', { id: z.string() },
  async ({ id }) => { const n = await readJson(P('templates', 'niches.json')); const t = n.templates.find((x) => x.id === id); return t ? ok(t) : fail(`Unknown template ${id}`); });

tool('list_voices', 'List free edge-tts en-US voices with tone and best-fit templates.', { gender: z.enum(['male', 'female']).optional() },
  async ({ gender }) => { const v = await readJson(P('templates', 'voices.json')); return ok(v.voices.filter((x) => !gender || x.gender === gender)); });

tool('get_episode', 'Episode summary: title, template, voice, music, scene counts and readiness.', { episode: episodeArg },
  async ({ episode }) => {
    const ep = await readEpisode(episode);
    const L = ep.scenes, myths = L.filter((s) => s.kind === 'myth');
    return ok({ title: ep.title, shortTitle: ep.shorts?.title, template: ep.template, voice: ep.voice, bgm: ep.bgm,
      longform: { scenes: L.length, seconds: L.reduce((a, s) => a + secs(s.time), 0), directionOnly: L.filter((s) => s.narrationIsDirection).length },
      shorts: { scenes: ep.shorts.scenes.length, seconds: ep.shorts.scenes.reduce((a, s) => a + secs(s.time), 0) },
      verdicts: myths.map((m) => ({ id: m.id, verdict: m.verdict || 'pending' })) });
  });

tool('list_scenes', 'List scenes of one cut with all editable fields.', { episode: episodeArg, cut: cutArg },
  async ({ episode, cut }) => { const ep = await readEpisode(episode); return ok(cutOf(ep, cut || ep.template)); });

tool('update_scene', 'Edit one scene and save episode.json. Captions max 6 words. Verdicts cannot be set here.', {
  episode: episodeArg, id: z.string(),
  narration: z.string().optional(), onScreen: z.string().optional(), sfx: z.enum(SFX).optional(), visual: z.string().optional(), edit: z.string().optional()
}, async ({ episode, id, ...fields }) => {
  if (fields.onScreen !== undefined && words(fields.onScreen) > 6) return fail('onScreen is over 6 words');
  return editEpisode(episode, (ep) => {
    const s = allScenes(ep).find((x) => x.id === id);
    if (!s) return fail(`Unknown scene ${id}`);
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) s[k] = k === 'onScreen' ? v.toUpperCase() : v;
    if (fields.narration !== undefined) { s.narrationIsDirection = false; delete s.voiceFile; delete s.voiceSec; }
    return ok({ saved: id, scene: s });
  });
});

tool('set_template', 'Switch the active cut: longform (16:9) or shorts (9:16).', { episode: episodeArg, template: z.enum(['longform', 'shorts']) },
  async ({ episode, template }) => editEpisode(episode, (ep) => { ep.template = template; return ok({ template }); }));

tool('set_voice', 'Set narration voice and rate for the episode.', { episode: episodeArg, id: z.string(), rate: z.enum(RATES).optional() },
  async ({ episode, id, rate }) => {
    const v = await readJson(P('templates', 'voices.json'));
    if (!v.voices.find((x) => x.id === id)) return fail(`Unknown voice ${id}. Use list_voices.`);
    return editEpisode(episode, (ep) => {
      ep.voice = { ...ep.voice, engine: 'edge-tts', id, ...(rate ? { rate } : {}) };
      allScenes(ep).forEach((s) => { delete s.voiceFile; delete s.voiceSec; });
      return ok({ voice: ep.voice, note: 'Existing voice files cleared; run synthesize_voice again.' });
    });
  });

tool('set_bgm', 'Turn background music on or off and set its level.', { episode: episodeArg, on: z.boolean(), gainDb: z.number().min(-40).max(-6).optional() },
  async ({ episode, on, gainDb }) => editEpisode(episode, (ep) => { ep.bgm = { ...ep.bgm, on, ...(gainDb !== undefined ? { gainDb } : {}) }; return ok({ bgm: ep.bgm }); }));

tool('validate_episode', 'Check a cut against its template rules: length, caption length, direction-only lines, missing footage, verdicts without footage.', { episode: episodeArg, cut: cutArg },
  async ({ episode, cut }) => {
    const ep = await readEpisode(episode), c = cut || ep.template, L = cutOf(ep, c), rules = ep.templates[c].rules, issues = [];
    const total = L.reduce((a, s) => a + secs(s.time), 0);
    if (total < rules.targetSec[0] || total > rules.targetSec[1]) issues.push(`Length ${total}s is outside the target ${rules.targetSec[0]}–${rules.targetSec[1]}s`);
    for (const s of L) {
      if (words(s.onScreen) > 6) issues.push(`${s.id}: caption over 6 words`);
      if (s.narrationIsDirection) issues.push(`${s.id}: narration is still a direction`);
      const has = await exists(P(s.footage));
      if (!has) issues.push(`${s.id}: missing ${s.footage}`);
      if (s.kind === 'myth' && s.verdict && s.verdict !== 'pending' && !has) issues.push(`${s.id}: verdict set without footage`);
    }
    return ok({ cut: c, seconds: total, issues });
  });

tool('synthesize_voice', 'Generate narration MP3 + SRT per scene with edge-tts, using the episode voice and rate. Skips direction-only lines. Saves voiceFile and voiceSec to each scene.', {
  episode: episodeArg, cut: cutArg, ids: z.array(z.string()).optional().describe('Scene ids; omit for the whole cut')
}, async ({ episode, cut, ids }) => {
  const ep = await readEpisode(episode), c = cut || ep.template, voice = ep.voice;
  const outDir = P('production', episode, 'voice', c);
  await mkdir(outDir, { recursive: true });
  const done = [], skipped = [];
  for (const s of cutOf(ep, c)) {
    if (ids && !ids.includes(s.id)) continue;
    if (s.narrationIsDirection || !s.narration) { skipped.push(s.id); continue; }
    const mp3 = path.join(outDir, `${s.id}.mp3`), srt = path.join(outDir, `${s.id}.srt`);
    try {
      await run(EDGE_TTS, ['--voice', voice.id, `--rate=${voice.rate || '+0%'}`, '--text', s.narration, '--write-media', mp3, '--write-subtitles', srt]);
    } catch (e) { return fail(JSON.stringify({ error: `edge-tts failed on ${s.id}: ${e.message}`, done, skipped }, null, 2)); }
    const voiceFile = path.relative(ROOT, mp3).split(path.sep).join('/'), voiceSec = srtEnd(await readFile(srt, 'utf8'));
    // Save each scene as soon as it's done, so a later failure keeps it. If the line or voice changed meanwhile, the file is stale: skip it.
    const saved = await editEpisode(episode, (cur) => {
      const t = cutOf(cur, c).find((x) => x.id === s.id);
      if (!t || t.narration !== s.narration || cur.voice.id !== voice.id || cur.voice.rate !== voice.rate) return null;
      Object.assign(t, { voiceFile, voiceSec });
      return ok('');
    });
    if (!saved) { skipped.push(s.id); continue; }
    const slot = secs(s.time);
    done.push({ id: s.id, file: voiceFile, seconds: voiceSec, slot, fits: !slot || voiceSec <= slot });
  }
  return ok({ voice, done, skipped, tooLong: done.filter((d) => !d.fits).map((d) => d.id) });
});

tool('list_notes', 'Review notes the creator left on scenes in the Studio ("make this scarier", "line too long"). Fix them with update_scene, then call resolve_note.', { episode: episodeArg, status: z.enum(['open', 'fixed', 'all']).default('open') },
  async ({ episode, status }) => { const ep = await readEpisode(episode); return ok((ep.notes || []).filter((n) => status === 'all' || n.status === status)); });

tool('resolve_note', 'Mark a review note as fixed and say in one sentence what you changed.', { episode: episodeArg, id: z.string(), reply: z.string() },
  async ({ episode, id, reply }) => editEpisode(episode, (ep) => {
    const n = (ep.notes || []).find((x) => x.id === id);
    if (!n) return fail(`Unknown note ${id}`);
    Object.assign(n, { status: 'fixed', reply, fixedAt: new Date().toISOString() });
    return ok(n);
  }));

tool('add_note', 'Leave a note for the creator on a scene, e.g. when only they can fix it (record footage, approve an image).', { episode: episodeArg, scene: z.string(), text: z.string() },
  async ({ episode, scene, text }) => editEpisode(episode, (ep) => {
    const n = { id: 'n' + Date.now(), scene, text, by: 'agent', status: 'open', at: new Date().toISOString() };
    ep.notes = [...(ep.notes || []), n];
    return ok(n);
  }));

await server.connect(new StdioServerTransport());
