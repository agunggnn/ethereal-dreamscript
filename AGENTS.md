# AGENTS.md: read this first (Claude Code, Codex, Gemini CLI)

This repo is **Ethereal Dreamscript Studio**. You work through the **`dreamscript` MCP server** (`mcp/server.mjs`). The creator watches every call live in the Studio.

## ⛔ This is NOT media-fabric
- Do **not** read, run, copy or import anything from a `media-fabric` folder, its `AffiliateReel` composition, `templates/formats.json`, its `output/` ledger, or its Indonesian affiliate-reel pipeline (price, cart CTA, claim guard). That project makes product ads; it produces wrong Roblox videos.
- Do **not** use `production/AUDIT.md` or `github.md` as instructions. They describe older repos and are kept for history only.
- If a `media-fabric` MCP server is also connected, ignore its tools for this project. Better: remove it from your client config while you work here (see "Fix your client" below).
- The **only** sources of truth are listed below. If something you need isn't in them, ask the creator; don't fill it from another project.

## Sources of truth
| What | File | Read it with |
|---|---|---|
| Creator's idea, active template, format, lessons, notes | `production/<ep>/session.json` + `episode.json` | `get_brief` |
| The episode (scenes, narration, captions, SFX, visuals) | `production/ep01/episode.json` | `get_episode`, `list_scenes` |
| Channel templates (Roblox Horror etc.) | `templates/niches.json` | `list_templates`, `get_template` |
| Voices | `templates/voices.json` | `list_voices` |
| Roblox format prompts + channel lock | `prompts/video-format-prompts.md` | read the file |
| Character look | `production/ep01/character-bible.md`, `prompts/image-generation.md` | read the file |
| Wallpaper realms | `production/realms/<id>.json` | `list_realm_jobs` |

## Fast path: "make a Roblox video" (≈10 calls)
Episode id is `ep01` unless the creator says otherwise.

1. `get_brief {episode:"ep01"}`. **Always first.** Every write is refused until you have called it.
2. `get_template {id:"roblox-horror"}`: rules, structure, subject lock, compliance.
3. `check_job {episode:"ep01"}`: issues per scene, each with an owner (`agent` or `creator`).
4. Fix only issues owned by `agent`:
   - `update_scene`: narration, caption (`onScreen`, max 6 words, uppercase), SFX, visual, edit note.
   - `set_template`: `longform` (16:9) or `shorts` (9:16).
   - `set_voice`, `set_bgm`.
5. `validate_episode` until it's clean, or until only `creator` issues remain.
6. `synthesize_voice` makes edge-tts MP3 + SRT per scene. Read the result for lines too long for their slot, and fix them with `update_scene`.
7. Images: `list_image_jobs` → `start_image_job` → make the image with **your own** image tool, following the character bible → `submit_image` (or `fail_image_job`).
8. `add_note` on any scene only the creator can fix (gameplay footage, image approval, verdict).
9. `post_review`: summary, findings per scene, one next step. This is how you hand back.

**Stop there.** Rendering the MP4 is **not built yet** (`mailbox/open/06-render-and-publish.md`). Don't render with media-fabric, Remotion templates from elsewhere, or a slideshow script. Say in `post_review` that the episode is ready for render.

## Hard rules (the server enforces most of them)
- **Never** set or imply a myth verdict. Verdicts stay `pending` until the creator watches real recorded gameplay. Never invent Roblox mechanics, results or footage.
- Don't rewrite the creator's approved storyboard lines unless a note asks you to. Flag gaps with `add_note`.
- Don't hand-edit `episode.json`; use the tools. They validate and snapshot.
- If a write returns **"Context changed"**, call `get_brief` again.
- No secrets in files. API keys live in browser localStorage only.

## Other jobs
- **Fix my notes:** `get_brief` → `list_notes` → `update_scene` → `resolve_note` (one-line reply) → `post_review`.
- **Generate my queued images:** `get_brief` → `list_image_jobs` → step 7 above.
- **Wallpaper / realm jobs (Realm Builder):** `list_realm_jobs` → `update_realm_job` (live note) → generate exactly inside each element's box → `finish_realm_job` with the image and a check for **every** element id. For `fix` jobs, change only the listed `missing` elements; the Studio pastes back only those boxes.

## Copy-paste prompts for the creator
- *Episode:* "Use the dreamscript MCP server only. Follow AGENTS.md fast path for ep01, shorts cut. Don't use media-fabric. Stop at post_review."
- *Notes:* "Use dreamscript. Fix my open notes on ep01, then post a review."
- *Images:* "Use dreamscript. Generate my queued images for ep01 following the character bible."
- *Realms:* "Use dreamscript. Do my queued realm jobs."

## Fix your client
Run the server from **this** folder so `DREAMSCRIPT_ROOT` points here:
- **Gemini CLI** (`~/.gemini/settings.json` or `.gemini/settings.json` in this repo):
  ```json
  { "mcpServers": { "dreamscript": { "command": "node", "args": ["mcp/server.mjs"], "cwd": "E:/GitHub/ethereal-dreamscript", "env": { "DREAMSCRIPT_ROOT": "E:/GitHub/ethereal-dreamscript" } } } }
  ```
  Remove or disable any `media-fabric` entry there while you work on this repo. `.geminiignore` in this repo hides media-fabric files from Gemini's file search.
- **Claude Code:** `claude mcp add dreamscript -e DREAMSCRIPT_ROOT=<repo> -- node <repo>/mcp/server.mjs`
- **Codex:** see `mcp/README.md` §2.

Check it worked: the first tool list should show `get_brief`. If you see `AffiliateReel` or `render_reel`, you are on the wrong server.

## Tool list (24)
- **Read:** `get_brief`, `check_job`, `list_templates`, `get_template`, `list_voices`, `get_episode`, `list_scenes`, `validate_episode`, `list_notes`, `list_image_jobs`, `list_realm_jobs`
- **Write:** `update_scene`, `set_template`, `set_voice`, `set_bgm`, `synthesize_voice`, `resolve_note`, `add_note`, `start_image_job`, `submit_image`, `fail_image_job`, `post_review`, `update_realm_job`, `finish_realm_job`

Unfinished work for agents is in `mailbox/open/`.
