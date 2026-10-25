# Dreamscript MCP server

Lets any MCP client edit the episode and make the narration. It reads and writes files in this project folder.

**Status:** tested. `npm test` starts both servers against a temp copy of the project (step 4).

## 1. Install
```
cd mcp
npm install
pip install edge-tts
```
Requires Node 18+ and Python 3.

## 2. Connect a client
Replace `<project>` with the absolute path of this folder.

**Claude Desktop / Cursor** (`mcpServers` JSON):
```json
{ "mcpServers": { "dreamscript": { "command": "node", "args": ["<project>/mcp/server.mjs"], "env": { "DREAMSCRIPT_ROOT": "<project>" } } } }
```
**Claude Code:**
```
claude mcp add dreamscript -e DREAMSCRIPT_ROOT=<project> -- node <project>/mcp/server.mjs
```
**Codex** (`~/.codex/config.toml`):
```toml
[mcp_servers.dreamscript]
command = "node"
args = ["<project>/mcp/server.mjs"]
env = { DREAMSCRIPT_ROOT = "<project>" }
```
If `edge-tts` isn't on your PATH, also set `EDGE_TTS_BIN` to its full path.

## 3. Open the Studio in live mode
```
cd mcp
npm run studio
```
Open http://localhost:4747/Home.dc.html. The Studio then reads and writes `episode.json` on disk, the same file the agent edits. You see the agent's changes as they happen.

## 4. Test
```
cd mcp
npm test
```
This covers the tool list, caption and verdict rules, parallel edits, the `episode` path check, and what the Studio server serves. To try tools by hand:
```
npx @modelcontextprotocol/inspector node mcp/server.mjs
```
Call `get_episode`, then `validate_episode`.

## Tools
| Tool | Does |
|---|---|
| `list_templates`, `get_template` | Read `templates/niches.json` |
| `list_voices` | Read `templates/voices.json` (17 en-US voices) |
| `get_episode`, `list_scenes` | Read `production/<ep>/episode.json` |
| `update_scene` | Edit narration, caption (6 words max), SFX, visual or edit note, then save |
| `set_template` | `longform` or `shorts` |
| `set_voice` | Voice id and rate, then clears old voice files |
| `set_bgm` | Music on/off and level |
| `validate_episode` | Checks length against the target, captions, direction-only lines, missing footage, and verdicts without footage |
| `list_notes`, `resolve_note`, `add_note` | Your review notes on scenes. The agent fixes them and replies |
| `synthesize_voice` | Runs edge-tts for each scene and writes `production/<ep>/voice/<cut>/<id>.mp3` and `.srt`. It records the duration and flags lines too long for their slot |

Agents can't set verdicts. A person sets them in the Studio after watching the uncut footage.

## Live mode: watch, review, fix
1. **Watch:** the top bar shows **LIVE**. Every tool call shows up in the Studio's agent feed (from `production/ep01/activity.json`). Changed scenes glow, and with **Follow agent** on the Studio jumps to the scene being edited.
2. **Review:** select a scene and write a note in the agent panel, e.g. "make this scarier" or "line too long". On the storyboard board, use **✎ Note** on any card.
3. **Fix:** in Claude Code or Codex, say "Fix my open notes in dreamscript". The agent calls `list_notes`, edits with `update_scene`, then calls `resolve_note` with a one-line reply, which appears under your note. **✦ Fix notes now** in the Studio does the same with the in-browser agent (only inside the Claude app).

If you and the agent edit at the same time, the Studio merges scene by scene instead of overwriting the agent's change.

## Try this prompt
> Use dreamscript. Validate the shorts cut, write final lines for any direction-only scenes, pick the best voice for a calm US Roblox horror investigator, then synthesize the voice and tell me which lines are too long.

## Without live mode
If you open the pages with a plain static server, the Studio saves edits only in the browser. Use **Copy episode.json** to hand them to an agent.

## Image jobs (Agent · MCP engine)
In Storyboard Studio pick **AI IMAGES → Agent · MCP**, press ✦ Generate on any card (or Generate all). Each job is saved in `episode.json` with status `queued`. Then tell your agent: "generate my queued dreamscript images".

The agent calls `list_image_jobs` → `start_image_job` (a short note that shows on the card) → makes the image with its own image tool → `submit_image` (file path or base64; saved to `production/<ep>/frames/<key>.png`) or `fail_image_job`. You approve with ✓ Use or redo with ↻ New. The agent can't approve images.

Migration note: adds 4 image tools (see also "Guided agent" below). Existing tool signatures are unchanged. Frame statuses `queued`, `working` and `awaiting` are new values on the existing `frame` object; the `episode.json` structure is unchanged. `episode` arguments now must match `^[a-z0-9][a-z0-9-]*$`.

## Guided agent: brief → check → fix → review
The server tells every MCP client to work in this order (server instructions + the `guide_episode` prompt):
1. `get_brief`: the creator's idea, active template, chosen episode format (with the global channel lock and handoff), channel lessons, open notes, image status.
2. `check_job`: issues per scene against the template rules, each with an owner (`agent` or `creator`), plus the format's accuracy rules.
3. Fix with the write tools, then `check_job` again.
4. `post_review`: summary, findings per scene and the next step. Shows on the Studio storyboard as **AGENT REVIEW**.

**Context guard:** every write tool is refused until the agent has called `get_brief`. It is refused again whenever the template, episode format, idea or cut changed since that brief. Template Hub and the Studio write the active template, format and idea to `production/<ep>/session.json`.

**Never lose work:**
- Every edit is copied to this browser immediately. If the disk save didn't finish, the Studio offers **Restore it** on the next load.
- `episode.json` is snapshotted to `production/<ep>/history/` at most every 2 minutes, before agent writes too. The last 40 snapshots are kept; restore them from **History…** in the Studio footer.
- Your step, scene, idea and review come back after a reload.
- Uploaded and Gemini images are saved to `production/<ep>/frames/`, not only in the browser.

## Realm jobs (Realm Builder)
Realm Builder locks a wallpaper as elements: id, label, detail, box [x,y,w,h], depth layer, required flag and motion. Each agent gets the same spec.
- **Ask agent to generate / fix missing / check** writes `production/realms/<id>.job.json`.
- The agent calls `list_realm_jobs`, then `update_realm_job` (a note shown live on the canvas), then `finish_realm_job` with the image and a check for every element id. The server refuses a finish without a full check.
- Realm tools skip the get_brief guard because each job carries its full context.

Tool count: 14 original + 4 image + 3 guide + 3 realm = 24. Add `production/*/session.json` and `production/*/history/` to `.gitignore`.
