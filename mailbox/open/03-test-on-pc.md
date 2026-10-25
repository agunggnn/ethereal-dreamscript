# 03 · First real run on the PC

**Why:** none of this has been run outside the design preview. No Node, no network to Gemini, no MCP client there.

**Test in this order, and write what failed under `## Result`:**
1. `cd mcp && npm i && npm run studio` → open `http://localhost:<port>/Home.dc.html`. Every Home tile opens its screen.
2. Reload each screen mid-work: work must survive (localStorage + server files).
3. Realm Builder:
   - Free generate (Pollinations) returns an image and adds a version.
   - Gemini API generate with a real key. Model id used: `gemini-2.5-flash-image`. If Google renamed it, fix it in `Realm Builder.dc.html` → `gemini()`.
   - Mark S4 and S5 ✗ → **Fix missing**: only those boxes change; S1/S2 pixels identical (diff the two version files).
   - Undo and clicking older versions works; survives reload.
   - **Ask agent to generate** with Claude Code / Codex / Gemini CLI connected to the MCP server: `list_realm_jobs` → `update_realm_job` → `finish_realm_job`. The note shows live on the canvas.
   - **Animate in Loop Studio** opens Loop Studio with marks placed on the moving elements.
4. Storyboard Studio: generate a storyboard, voice preview (edge-tts), image fill.
5. Channel: YouTube OAuth (`npm run credentials:setup` in the main repo) — never tested.
