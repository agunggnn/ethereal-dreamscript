# 08 · Keep agents off media-fabric

**Why:** Gemini, asked to "read dreamscript and make a Roblox video", rendered with media-fabric's affiliate-reel pipeline instead.

**Already done in this project:**
- `AGENTS.md`: fast path, sources of truth, explicit "not media-fabric" rule, client config.
- `GEMINI.md`: "Start here" block at the top pointing to `AGENTS.md`.
- `.geminiignore`: hides media-fabric, `AffiliateReel`, `formats.json`, `AUDIT.md`.
- `mcp/server.mjs`: server instructions now say "not media-fabric" and "stop at post_review".

**Do on the PC:**
1. Copy `AGENTS.md`, `GEMINI.md`, `.geminiignore` and `mcp/server.mjs` into `E:\GitHub\ethereal-dreamscript`.
2. Make sure media-fabric is **not inside** that folder or a parent Gemini opens as its workspace. If it is, move it out (e.g. `E:\GitHub\media-fabric`).
3. In `~/.gemini/settings.json`, disable any `media-fabric` MCP server and add `dreamscript` with the config in `AGENTS.md`.
4. Test: in Gemini CLI, type `/mcp`. Only `dreamscript` should be listed, with 24 tools. Then paste: "Use the dreamscript MCP server only. Follow AGENTS.md fast path for ep01, shorts cut. Stop at post_review."

**Done when:** the run's first call is `get_brief`, no file path contains `media-fabric`, and the Studio shows an AGENT REVIEW.
