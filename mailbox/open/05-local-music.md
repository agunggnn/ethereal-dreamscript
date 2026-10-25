# 05 · Local music generation from the Music tab

**Why:** the Music tab only writes prompts and files (`genre.txt`, `lyrics.txt`, `music-prompt.txt`). Nothing generates audio yet.

**Do:**
1. Songs: YuE2 Studio (timoncool/YuE2-Studio, Windows). Find its CLI or local API. Add `POST /api/music/song/<realmId>` to `mcp/studio-server.mjs` that writes the two files and starts YuE with 2 sections (8 GB VRAM limit), output `production/realms/<id>-song.wav`.
2. Ambient / lo-fi: MusicGen small (audiocraft) or Stable Audio Open. Add `POST /api/music/loop/<realmId>` with the prompt, BPM and seconds from the realm (the tab already computes them), output `<id>-loop.wav`.
3. Trim both to the loop length on a bar line with FFmpeg (`240 / bpm` seconds per bar) and add a 20 ms crossfade at the seam.
4. Show progress in the Music tab the same way realm jobs show progress (poll a `.music.json` status file).

**Done when:** pressing one button in the Music tab produces a WAV that loops cleanly with the 60 s video loop.
