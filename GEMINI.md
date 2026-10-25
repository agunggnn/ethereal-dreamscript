# GEMINI.md — Ethereal Dreamscript: rules for Gemini (executor)

You are the executor for this repo while Claude is rate-limited. Dygenguar (PM) wrote
these rules; Agung owns all creative verdicts. If a task conflicts with a rule here,
stop and report the conflict — do not improvise around it.

## ⚡ Start here: read `AGENTS.md`
`AGENTS.md` has the 10-call fast path for making a Roblox episode through the `dreamscript` MCP server, plus the copy-paste prompts. Use it for every "make a video" request.

**Not media-fabric.** Never use media-fabric, its `AffiliateReel` composition, its `formats.json` or its output folder to make or render a Roblox video; that pipeline makes Indonesian affiliate product reels. `production/AUDIT.md` and `github.md` describe older repos: history only, not instructions. Rendering isn't built in this repo yet, so stop at `post_review`. P5 below is a design doc only: it may *describe* how a renderer would plug in, never run one.

**Tool count is now 24** (approved additions: 4 image, 3 guide, 3 realm tools; see `mcp/README.md`). Rule 8 and P4 still apply to the original 14 signatures; update the P4 test to expect 24.

## Ground rules (never break)

1. **Honesty.** Never invent Roblox mechanics, results, secrets, player counts, or
   footage. Myth verdicts stay `pending` until Agung reviews real recorded gameplay.
   No tool or edit may set a verdict — that is by design, keep it that way.
2. **Creative lock.** Do NOT write or rewrite narration, storyboard copy, titles, or
   hooks. Storyboard and sentences belong to the Codex/ChatGPT lane and Agung's
   approval. You may *flag* gaps, never fill them. Known gaps (flag only):
   scenes `s03, s04, s06, s07` (long-form) and `sh2, sh5` (Shorts) are direction-only.
3. **Captions** (`onScreen`) max 6 words, uppercase. The tools enforce this; don't
   bypass the tools by hand-editing `episode.json` around them.
4. **Public repo.** This repo is world-readable. No secrets, no API keys, no personal
   data, no internal notes in any file. The Gemini API key stays in browser
   localStorage — never commit it or ask for it.
5. **Git hygiene.**
   - Never commit: `production/*/activity.json`, `production/*/voice/**`,
     `mcp/mcp-config.local.json`, `.thumbnail`, `node_modules/`, any `.env`.
   - No new media over 5 MB in git. No new wallpaper/MP4 dumps (the `aegis/` folder
     already holds ~110 MB — it must stop growing until Agung decides on LFS).
   - No duplicate files: `assets/wall_*.jpg` must not byte-duplicate `aegis/*.jpg`.
6. **Workflow.** One branch per task: `gemini/<slug>`. PR to `main`, never push to
   `main` directly. Conventional commit messages. **No AI attribution** (no
   `Co-Authored-By`, no "Generated with" footers) — Agung's standing rule.
7. **Verify, don't claim.** Every PR includes the commands you ran and their real
   output (e.g. `npm ci`, MCP smoke test, `validate_episode`). If a check cannot
   run in your environment, say so explicitly. A claim without output = not done.
8. **Schema freeze.** Do not change the `episode.json` structure (`specVersion`) or
   the 14 MCP tool signatures without a migration note in the PR and Dygenguar's OK.
9. **MCP server safety.** Keep zod validation on every tool argument. Sanitize the
   `episode` argument (`^[a-z0-9][a-z0-9-]*$`, reject `..` and path separators).
   Process spawning stays shell-free (`spawn` with arg arrays only).
10. **Studio server safety.** `studio-server.mjs` must stay bound to `127.0.0.1`.
    It currently serves *any* file under the project root — fix that (P1 below)
    before anyone uses it through a tunnel. No auth may be "added later"; the
    allowlist fix is the gate.

## Environment

- PC clone: `E:\GitHub\ethereal-dreamscript` (Node 22, Python 3 + edge-tts via `setup.ps1`).
- Git push works over SSH port 443 (`ssh://git@ssh.github.com:443/...`); port 22 hangs.
- Studio: `cd mcp && npm run studio` → http://localhost:4747/Home.dc.html
- Source of truth: `production/ep01/episode.json`. Templates: `templates/niches.json`.
  Voice catalog: `templates/voices.json` (17 edge-tts voices).

## Work queue (in this order — one PR each)

**P0 — Repo hygiene PR** (`gemini/hygiene-01`)
- `.gitignore`: add `production/*/activity.json`, `production/*/voice/`, `.thumbnail`.
- Untrack `production/ep01/activity.json` and `.thumbnail` (`git rm --cached`).
- Delete `github.md` (it describes a different repo: youtube-automation-agent).
- Move `production/AUDIT.md` → `docs/legacy/audit-youtube-automation-agent.md` with a
  one-line header saying it audits the old repo, kept for reference only.
- Dedupe wallpapers: first grep the `.dc.html` files for which path each page actually
  loads (`aegis/` vs `assets/wall_*`), keep the referenced one, delete the duplicate,
  and list in the PR which file each page referenced. If a page references both,
  stop and report instead of guessing.

**P1 — Studio server allowlist PR** (`gemini/studio-allowlist`)
- In `mcp/studio-server.mjs`: serve only these extensions — html, js, mjs, json, css,
  png, jpg, jpeg, webp, svg, wav, mp3, mp4, webm, srt, md. Block dotfiles and any
  path containing `.git` (respond 403/404). Keep the existing PUT episode validation.
- Prove it in the PR with curl output: `/production/ep01/episode.json` → 200,
  `/.git/config` → blocked, `/mcp/mcp-config.local.json` → blocked,
  `/mcp/server.mjs` → blocked (`.mjs` is in the allowlist for browser modules —
  if that conflicts, block everything under `mcp/` except nothing; studio pages
  don't load server files. Decide: block `mcp/` entirely and show the curl proof).

**P2 — Port the missing production docs** (`gemini/port-docs`)
- From `agunggnn/youtube-automation-agent` (`content/roblox-horror-myth-lab-ep01/`):
  copy `character-bible.md` → `production/ep01/character-bible.md` and
  `prompts/image-generation.md` → `prompts/image-generation.md`. These are the files
  `episode.json` and `templates/niches.json` already reference.
- Copy verbatim; if a referenced path inside them doesn't exist here, list it in the
  PR instead of editing the text.

**P3 — Character assets, DRAFT only** (`gemini/character-draft`)
- Generate candidate turnaround art for `RHM_INVESTIGATOR_01` strictly following
  `production/ep01/character-bible.md`, plus one corridor location plate.
- Save as `assets/character-reference.draft.png` and `assets/loc-corridor.draft.png`.
- Do NOT rename to the canonical names and do NOT change `ingredients.status` in
  `episode.json` — Agung approves the art first; approval is his message, not yours.

**P4 — MCP server tests** (`gemini/mcp-tests`)
- Add `node:test` tests under `mcp/test/` that boot the server over stdio and assert:
  `tools/list` returns 14 tools; `update_scene` rejects a >6-word caption;
  `update_scene` cannot set a verdict; `validate_episode` flags missing footage;
  a traversal `episode` value (`../x`) is rejected. Wire `npm test` in `mcp/package.json`.

**P5 — DESIGN ONLY, no code** (`gemini/design-mix-render`)
- Write `docs/design-mix-render.md`: how a `mix_audio` step (ffmpeg: voice + SFX +
  BGM ducking, master to −14 LUFS, verify with loudnorm/ebur128 on the rendered file)
  and a media-fabric render composition would plug into the current MCP tool set.
  Inputs/outputs, file layout, failure modes. Stop there — implementation waits for
  Dygenguar/Agung approval.

## Out of scope for you

Recording gameplay footage (Agung), setting verdicts (Agung), narration/storyboard
writing (Codex lane), YouTube credentials/upload, making the repo private (Agung),
Git LFS migration (rewrites history — Agung decides), adding new channels/templates.

## Report format (every PR)

Summary → files changed → verification commands + raw output → what's still missing.
If you finish the queue, stop; do not invent new tasks.
