# Mailbox

Work that the design agent could not finish from inside the design environment. Any agent (Claude Code, Codex, Gemini CLI) working on the real PC or repo should pick tasks from here.

## How to use
- Open tasks live in `mailbox/open/`, one file per task, named `NN-short-name.md`.
- Pick one, do it, then move the file to `mailbox/done/` and add a `## Result` section: what changed, which files, how you tested it.
- If you get blocked, add a `## Blocked` section with the reason and leave the file in `open/`.
- Never delete a task. Never mark one done without testing it on the real machine.
- Keep the project rules: storyboard first, the element spec in `production/realms/*.json` is the source of truth for wallpapers, and call `get_brief` before editing an episode.

## Where things live
- UI screens: `*.dc.html` at the project root (open directly in a browser through `npm run studio`).
- Local server: `mcp/studio-server.mjs` (serves the UI and the `/api/*` endpoints).
- MCP server: `mcp/server.mjs` (24 tools).
- Wallpaper realms: `production/realms/<id>.json`, `<id>.job.json`, `<id>-v<n>.jpg`.
- Episodes: `production/<ep>/episode.json`.
- Theme converter for new dark screens: `mcp/theme-light.js`.
