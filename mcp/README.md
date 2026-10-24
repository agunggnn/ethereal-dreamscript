# Dreamscript MCP server

Lets any MCP client edit the episode and make the narration. It reads and writes files in this project folder.

**Status:** written but **not run yet**. Test it with the MCP Inspector (step 3) before relying on it.

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
3. **Fix:** in Claude Code or Codex, say "Fix my open notes in dreamscript". The agent calls `list_notes`, edits with `update_scene`, then calls `resolve_note` with a one-line reply, which appears under your note. **✦ Fix notes now** in the Studio does the same with the in-browser agent.

## Try this prompt
> Use dreamscript. Validate the shorts cut, write final lines for any direction-only scenes, pick the best voice for a calm US Roblox horror investigator, then synthesize the voice and tell me which lines are too long.

## Without live mode
If you open the pages with a plain static server, the Studio saves edits only in the browser. Use **Copy episode.json** to hand them to an agent.
