# 02 · Push this project to GitHub

**Why:** the design agent has read-only GitHub access. Nothing from these sessions is in the repo yet.

**Do:** copy these files into `agunggnn/youtube-automation-agent` (branch `master`, folder `studio/`), keeping paths:
- `Home.dc.html`, `Storyboard Studio.dc.html`, `Loop Studio.dc.html`, `Realm Builder.dc.html`, `Channel.dc.html`, `Template Hub.dc.html`, `Audio Lab.dc.html`, `support.js`
- `mcp/server.mjs`, `mcp/studio-server.mjs`, `mcp/package.json`, `mcp/README.md`, `mcp/theme-light.js`
- `mailbox/` (whole folder), `templates/`, `setup.ps1`, `DEPLOY.md`
- Do not commit `aegis/*.mp4` (large); add them to Git LFS or keep them local.

Your local folder `Ethereal Dreamscript Dashboard/` is behind this project: it has no `Realm Builder.dc.html`, no `mailbox/`, and the old dark screens. Download the project zip and overwrite the local folder first (keep the local `prompts/`, `.gitignore` and `GEMINI.md`, which only exist locally).

Then update `github.md` with the commit sha. `GEMINI.md` needs a note that the MCP server now has 24 tools (3 new: `list_realm_jobs`, `update_realm_job`, `finish_realm_job`).

**Done when:** a fresh clone + `setup.ps1` + `npm run studio` opens Home.
