# Ethereal Dreamscript: faceless YouTube studio

Storyboard-first production for the US YouTube audience. The first channel is Roblox Horror Myth Lab (`RHM_INVESTIGATOR_01`).

## Run it
```
cd mcp && npm install && npm run studio
```
Then open http://localhost:4747/Home.dc.html. This is live mode: the Studio and your MCP agent share `episode.json`. `npx serve .` also works, but edits then stay in the browser. Microsoft Edge previews the real neural voices; other browsers use a stand-in.

## Pages
- **Home**: console-style launcher. Create tab: Episode, Short, Character, Templates, Audio, Competitors, Agents, Render, System. Library tab: the 6 niche templates. Navigate with ← → ↓ ↑ and Enter.
- **Storyboard Studio**: scene-by-scene editor for the long cut (16:9) and the Short (9:16). Per scene you can edit the clip, voice line, voice and rate, caption, SFX, visual direction, and the Flow/Veo prompt. Verdicts stay locked until footage exists. It has an in-browser agent. Keys: ← → scenes, Space play, Esc Home.
- **Audio Lab**: 17 free en-US voices with preview on your own line, SFX, and music.
- **Loop Studio**: Music & Live Wallpaper template. Wallpaper (stock, upload, AI), live motion, music generated in the browser or uploaded, then a seamless WebM loop and an FFmpeg command for 1 hour.
- **Channel**: brand kit, plan for the first 10 videos, read-only YouTube stats (Google OAuth), and learned rules that feed the storyboard AI.
- **Template Hub**: template details, template factory, competitor inspector.

## Data (what agents edit)
- `production/ep01/episode.json`: the storyboard. It's the single source of truth.
- `templates/niches.json`: channel templates.
- `templates/voices.json`: voice catalog.
- `sfx/`: audio from media-fabric.

## Agents
See `mcp/README.md`. It covers 14 tools, live mode, review notes, and configs for Claude Code, Codex, Claude Desktop and Cursor.

## How a video gets made
1. The storyboard lives in `episode.json`.
2. `synthesize_voice` (edge-tts) writes an MP3 and SRT for each scene.
3. The SFX and music are mixed and mastered to -14 LUFS.
4. Remotion renders the MP4.
5. The bundle goes to upload.

Steps 1–2 work. Step 4 needs an episode composition in media-fabric, and step 5 needs YouTube credentials. See `production/AUDIT.md`.
