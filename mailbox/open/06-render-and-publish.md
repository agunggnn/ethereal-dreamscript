# 06 · Real MP4 render and upload

**Why:** the UI plans the video; it cannot render or upload. See `production/AUDIT.md` sections 3 and 7.

**Do:**
1. Add `POST /render-episode {episodePath}` to the main repo (`index.js`): load `production/<ep>/episode.json`, skip strategy/script generation, render with Remotion (reuse media-fabric's 9:16 safe zone), build the SRT from the measured TTS length (`ffprobe`), output `production/<ep>/render/final.mp4`.
2. Add `POST /render-loop {realmId}` for Loop Studio: export the loop at 3840×2160, 30 fps, with the realm's music.
3. Wire the **Render** buttons in Storyboard Studio and Loop Studio to these endpoints through `studio-server.mjs` (proxy), and show progress.
4. YouTube OAuth + upload as draft (never public automatically).

**Done when:** one episode goes from approved storyboard to a private YouTube draft without leaving the UI.
