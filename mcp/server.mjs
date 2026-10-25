#!/usr/bin/env node
// Dreamscript MCP server: lets any MCP client (Claude Code, Codex, Claude Desktop, Cursor)
// read templates and voices, edit production/<episode>/episode.json, and synthesize narration with edge-tts.
// Agents can't set verdicts. That stays a human decision after footage review.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir, access, copyFile, readdir, unlink } from 'node:fs/promises';
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

const GUIDE = [
  'You are working inside the creator\'s Dreamscript Studio. The creator watches every call live.',
  '1. Call get_brief first. It holds their idea, the active channel template, the chosen episode format with the global channel lock, channel lessons and open notes. Follow all of it; do not work from memory of an earlier session.',
  '2. Call check_job to see what is missing or breaks the template rules.',
  '3. Fix only what is yours to fix (scenes, captions, image jobs, notes) with the write tools. Anything marked owner "creator" (footage, approvals, verdicts, picking a template or format) goes into your review instead.',
  '4. Call check_job again, then post_review: what you changed, what still breaks the template, and the one next step for the creator.',
  'Never invent gameplay results, mechanics, secrets, quotes or verdicts. If the brief lacks facts or footage, say so in post_review instead of guessing.',
  'If a write returns "Context changed", the creator edited the template, format, idea or cut: call get_brief again before continuing.'
].join('\n');
const server = new McpServer({ name: 'dreamscript', version: '0.3.0' }, { instructions: GUIDE });

// Every call is appended to production/<ep>/activity.json so the Studio (live mode) can show what the agent is doing.
const READS = new Set(['list_templates', 'get_template', 'list_voices', 'get_episode', 'list_scenes', 'validate_episode', 'list_notes', 'list_image_jobs', 'get_brief', 'check_job']);
async function logActivity(episode, name, args, res) {
  const file = P('production', episode, 'activity.json');
  await serial(file, async () => {
    const log = (await exists(file)) ? await readJson(file) : [];
    const { episode: _e, ...rest } = args || {};
    const detail = name === 'start_image_job' ? rest.key + ': ' + (rest.note || '') : name === 'submit_image' ? rest.key + ' · ' + (rest.model || 'image') : name === 'update_scene' ? rest.id + ': ' + Object.keys(rest).filter((k) => k !== 'id').join(', ') : JSON.stringify(rest).slice(0, 90);
    log.push({ at: new Date().toISOString(), by: 'agent', tool: name, kind: READS.has(name) ? 'read' : 'write', scene: rest.id || rest.key || null, detail: detail === '{}' ? '' : detail, error: !!(res && res.isError) });
    await writeJson(file, log.slice(-200));
  }).catch(() => {});
}
// Context the agent must have loaded before writing: template, format, idea and cut. Comes from session.json (written by the Studio and Template Hub) and episode.json.
const readSession = async (episode) => { const f = P('production', episode, 'session.json'); return (await exists(f)) ? readJson(f).catch(() => ({})) : {}; };
const activeCtx = (s, ep) => {
  const st = s.studio || {}, hub = s.hub || {}, hubNewer = (hub.at || '') > (st.at || ''), c = (ep.template === 'shorts' ? ep.shorts?.concept : ep.concept) || ep.concept || {};
  return { template: (hubNewer ? hub.template : st.template) || st.template || hub.template || c.template || null, format: (hubNewer ? hub.format : st.format) || hub.format || st.format || null, cut: ep.template, idea: st.idea || c.idea || '', game: st.game || c.game || '' };
};
const contextSig = async (episode) => { try { const [s, ep] = await Promise.all([readSession(episode), readJson(epPath(episode))]); return JSON.stringify(activeCtx(s, ep)); } catch { return 'none'; } };
const briefed = {};
// Same history/ snapshots as the Studio server, so an agent edit can always be undone from the Studio's History menu.
async function snapshot(episode) {
  try {
    const prev = await readFile(epPath(episode), 'utf8'), hd = P('production', episode, 'history');
    await mkdir(hd, { recursive: true });
    const all = (await readdir(hd)).filter((n) => /^episode-\d{13}\.json$/.test(n)).sort(), last = all.at(-1);
    if (last && Date.now() - +last.slice(8, 21) < 120000) return;
    if (last && (await readFile(path.join(hd, last), 'utf8')) === prev) return;
    await writeFile(path.join(hd, `episode-${Date.now()}.json`), prev, 'utf8');
    for (const n of all.slice(0, Math.max(0, all.length - 39))) await unlink(path.join(hd, n)).catch(() => {});
  } catch {}
}
const tool = (name, desc, shape, fn) => server.tool(name, desc, shape, async (args) => {
  const episode = (args && args.episode) || 'ep01';
  let res;
  if (!READS.has(name) && briefed[episode] !== await contextSig(episode)) res = fail('Context changed or not loaded yet (template, episode format, idea or cut). Call get_brief, then retry.');
  else { if (!READS.has(name) && name !== 'post_review') await snapshot(episode); res = await fn(args); if (name === 'set_template' && !res.isError) briefed[episode] = await contextSig(episode); }
  await logActivity(episode, name, args, res);
  return res;
});

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

// Image jobs: the Studio ("Agent · MCP" engine) queues frames in episode.json; the agent generates them with its own image tool.
const frameKeys = (ep) => [...Object.keys(ep.frames || {}).map((k) => [k, ep.frames[k]]), ...allScenes(ep).map((s) => [s.id, s.frame])];
const getFrame = (ep, key) => (key === 'char' || key.startsWith('thumb') ? (ep.frames || {})[key] : allScenes(ep).find((s) => s.id === key)?.frame);
const setFrame = (ep, key, fr) => { if (key === 'char' || key.startsWith('thumb')) ep.frames = { ...(ep.frames || {}), [key]: fr }; else allScenes(ep).find((s) => s.id === key).frame = fr; };
const KIND = { char: 'character reference sheet' };

tool('list_image_jobs', 'Images the creator queued in the Studio. Each job has the full prompt, size, aspect and (for scenes) the approved character sheet to use as reference. Generate the character sheet first if it is queued.', { episode: episodeArg },
  async ({ episode }) => {
    const ep = await readEpisode(episode);
    const jobs = frameKeys(ep).filter(([, fr]) => fr && (fr.status === 'queued' || fr.status === 'working'))
      .map(([key, fr]) => ({ key, kind: KIND[key] || (key.startsWith('thumb') ? 'thumbnail' : 'scene'), status: fr.status, prompt: fr.prompt, width: fr.width, height: fr.height, aspect: fr.aspect, reference: fr.reference || null, queuedAt: fr.queuedAt }));
    return ok(jobs.sort((a, b) => (a.key === 'char' ? -1 : b.key === 'char' ? 1 : 0)));
  });

tool('start_image_job', 'Tell the creator what you are doing on a job; the card shows the note live. Call again to update it (e.g. "trying again, face drifted").', { episode: episodeArg, key: z.string(), note: z.string().max(140) },
  async ({ episode, key, note }) => editEpisode(episode, (ep) => {
    const fr = getFrame(ep, key);
    if (!fr) return fail(`No queued image for ${key}`);
    setFrame(ep, key, { ...fr, status: 'working', agentNote: note, startedAt: fr.startedAt || new Date().toISOString() });
    return ok({ key, status: 'working', note });
  }));

tool('submit_image', 'Attach the generated image to a job. Pass either file (a PNG/JPG/WEBP path you saved, absolute or relative to the project root) or base64. The creator approves or rejects it in the Studio.', {
  episode: episodeArg, key: z.string(), file: z.string().optional(), base64: z.string().optional(), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']).default('image/png'), model: z.string().max(60).describe('Model or tool used, e.g. gemini-2.5-flash-image')
}, async ({ episode, key, file, base64, mime, model }) => {
  if (!/^[\w-]+$/.test(key)) return fail('Bad key');
  if (!file && !base64) return fail('Pass file or base64');
  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[file ? ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(file).toLowerCase()] || 'image/png') : mime];
  const dir = P('production', episode, 'frames'), out = path.join(dir, key + ext);
  const src = file ? path.resolve(ROOT, file) : null;
  if (src && !(await exists(src))) return fail(`File not found: ${file}`);
  return editEpisode(episode, async (ep) => {
    const fr = getFrame(ep, key);
    if (!fr) return fail(`No queued image for ${key}`);
    await mkdir(dir, { recursive: true });
    if (src) await copyFile(src, out);
    else await writeFile(out, Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64'));
    const rel = path.relative(ROOT, out).split(path.sep).join('/');
    const { agentNote, startedAt, ...rest } = fr;
    setFrame(ep, key, { ...rest, status: 'review', engine: 'agent', model, url: rel + '?v=' + Date.now(), doneAt: new Date().toISOString() });
    return ok({ key, saved: rel, status: 'review', next: 'The creator reviews it in the Studio.' });
  });
});

tool('fail_image_job', 'Give up on a job and tell the creator why in one sentence (no image tool, safety refusal, quota).', { episode: episodeArg, key: z.string(), error: z.string().max(160) },
  async ({ episode, key, error }) => editEpisode(episode, (ep) => {
    const fr = getFrame(ep, key);
    if (!fr) return fail(`No queued image for ${key}`);
    const { agentNote, startedAt, ...rest } = fr;
    setFrame(ep, key, { ...rest, status: 'error', error: 'Agent: ' + error });
    return ok({ key, status: 'error' });
  }));

tool('get_brief', 'START HERE. Everything the creator set up: their idea, the active channel template (rules, structure, compliance), the chosen episode format with the global channel lock and handoff checklist, channel lessons, where they are in the Studio, open notes and image status. Required before any edit.', { episode: episodeArg },
  async ({ episode }) => {
    const [s, ep, n] = await Promise.all([readSession(episode), readEpisode(episode), readJson(P('templates', 'niches.json'))]);
    const ctx = activeCtx(s, ep), t = n.templates.find((x) => x.id === ctx.template) || null, F = t && t.formats;
    const fmt = F ? F.list.find((x) => x.id === ctx.format) || null : null;
    const cut = ep.template, L = cutOf(ep, cut), concept = (cut === 'shorts' ? ep.shorts.concept : ep.concept) || ep.concept || null;
    const images = frameKeys(ep).reduce((a, [, fr]) => { const k = fr ? fr.status : 'none'; a[k] = (a[k] || 0) + 1; return a; }, {});
    briefed[episode] = JSON.stringify(ctx);
    return ok({
      creator: { idea: ctx.idea || '(not written yet)', game: ctx.game, studioStep: s.studio?.step || null, lessons: s.studio?.lessons || [] },
      template: t ? { id: t.id, label: t.label, concept: t.concept, audience: t.audience, hook: t.hook, structure: cut === 'shorts' ? t.structure?.short : t.structure?.long, subject: t.subject, visual: t.visual, motion: t.motion, voice: t.voice, thumbnail: t.thumbnail, compliance: t.compliance } : 'No template picked. Ask the creator to choose one in Template Hub.',
      format: fmt ? { ...fmt, globalLock: F.globalLock, handoff: F.handoff, handoffRule: F.handoffRule } : F ? 'No episode format picked. Ask the creator to pick one in Template Hub → Episode formats. Options: ' + F.list.map((x) => x.id + ' ' + x.name).join(', ') : null,
      episode: { title: cut === 'shorts' ? ep.shorts.title : ep.title, cut, rules: ep.templates[cut].rules, concept, scenes: L.length, directionOnly: L.filter((x) => x.narrationIsDirection).map((x) => x.id), images },
      openNotes: (ep.notes || []).filter((x) => x.status === 'open'),
      yourLastReview: s.agentReview || null,
      next: 'Call check_job, fix what is yours, check_job again, then post_review.'
    });
  });

tool('check_job', 'Check the episode against the active template, the episode format and the creator\'s idea. Returns issues per scene with an owner (agent or creator) and the format\'s accuracy rules. Run before and after your edits.', { episode: episodeArg, cut: cutArg },
  async ({ episode, cut }) => {
    const [s, ep, n] = await Promise.all([readSession(episode), readEpisode(episode), readJson(P('templates', 'niches.json'))]);
    const ctx = activeCtx(s, ep), t = n.templates.find((x) => x.id === ctx.template) || null, c = cut || ep.template, L = cutOf(ep, c), rules = ep.templates[c].rules, issues = [];
    const add = (scene, rule, problem, owner = 'agent') => issues.push({ scene, rule, problem, owner });
    if (!t) add(null, 'template', 'No template picked in Template Hub', 'creator');
    if (t?.formats && !ctx.format) add(null, 'format', 'No episode format picked in Template Hub', 'creator');
    if (!ctx.idea) add(null, 'idea', 'No idea written in Studio step 1', 'creator');
    const total = L.reduce((a, x) => a + secs(x.time), 0);
    if (total < rules.targetSec[0] || total > rules.targetSec[1]) add(null, 'length', `${total}s is outside ${rules.targetSec[0]}–${rules.targetSec[1]}s`);
    if (L[0] && secs(L[0].time) > rules.hookSec) add(L[0].id, 'hook', `Hook is ${secs(L[0].time)}s, max ${rules.hookSec}s`);
    const ch = (ep.frames || {}).char;
    if (!ch || ch.status !== 'approved') add('char', 'image', ch?.status === 'review' ? 'Character sheet waiting for approval' : 'Character sheet not made yet', ch?.status === 'review' ? 'creator' : 'agent');
    for (const x of L) {
      const sec = secs(x.time), w = words(x.narration);
      if (words(x.onScreen) > 6) add(x.id, 'caption', 'Caption over 6 words');
      if (x.narrationIsDirection) add(x.id, 'narration', 'Narration is still a direction');
      else if (sec && w / sec > 3) add(x.id, 'pacing', `${w} words in ${sec}s (over 3 words/s)`);
      if (rules.changeEverySec && sec > rules.changeEverySec[1] * (c === 'shorts' ? 1.8 : 3)) add(x.id, 'pacing', `${sec}s without a picture change`);
      const gameplay = !(x.gen && x.gen.source === 'generated'), has = await exists(P(x.footage));
      if (gameplay && !has) add(x.id, 'footage', `Record ${x.footage}`, 'creator');
      if (x.kind === 'myth' && x.verdict && x.verdict !== 'pending' && !has) add(x.id, 'accuracy', 'Verdict set without footage', 'creator');
      const fr = x.frame;
      if (!fr) add(x.id, 'image', 'No image yet');
      else if (fr.status === 'review') add(x.id, 'image', 'Image waiting for approval', 'creator');
      else if (fr.status !== 'approved') add(x.id, 'image', 'Image ' + fr.status);
    }
    for (const note of (ep.notes || []).filter((x) => x.status === 'open')) add(note.scene, 'note', note.text);
    const F = t?.formats;
    return ok({ cut: c, seconds: total, template: t?.id || null, format: ctx.format, issues,
      agentCanFix: issues.filter((i) => i.owner === 'agent').length, needsCreator: issues.filter((i) => i.owner === 'creator').map((i) => (i.scene ? i.scene + ': ' : '') + i.problem),
      accuracyRules: F?.globalLock?.accuracy || t?.compliance || null });
  });

tool('post_review', 'Show your analysis to the creator in the Studio storyboard: a short summary, findings per scene, and the one next step. Replaces your previous review.', {
  episode: episodeArg, summary: z.string().max(600), items: z.array(z.object({ scene: z.string().optional(), text: z.string().max(240) })).max(12).default([]), next: z.string().max(200).optional()
}, async ({ episode, summary, items, next }) => {
  const f = P('production', episode, 'session.json');
  return serial(f, async () => {
    const s = await readSession(episode);
    s.agentReview = { at: new Date().toISOString(), summary, items, next: next || '' };
    await writeJson(f, s);
    return ok(s.agentReview);
  });
});

server.prompt('guide_episode', 'Guided pass over the current episode: brief, check, fix, review.', {}, () => ({ messages: [{ role: 'user', content: { type: 'text', text: GUIDE + '\n\nStart now: call get_brief for ep01.' } }] }));

await server.connect(new StdioServerTransport());
