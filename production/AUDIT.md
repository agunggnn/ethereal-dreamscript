# Audit — youtube-automation-agent @ master (+ local media-fabric)

Read on 2026-10-23 from GitHub (`agunggnn/youtube-automation-agent`, branch `master`) and the attached local `media-fabric` folder. **Nothing was executed.** This environment cannot run Node, Python, FFmpeg, Playwright or any provider API, so every statement below comes from reading source. No tests were run.

## 1. Real entry point and pipeline

`npm start` → `index.js` `YouTubeAutomationAgent.start()` → `initialize()` → Express on `PORT` (3456).

`POST /generate {topic, style, length}` → `index.js generateContent()`:

1. `agents/content-strategy-agent.js generateContentStrategy(topic)`
2. `agents/script-writer-agent.js generateScript(strategy)` (AI if a text provider is set, otherwise template)
3. `agents/thumbnail-designer-agent.js generateThumbnail(script)`
4. `agents/seo-optimizer-agent.js optimize(script, strategy)`
5. `agents/production-management-agent.js processContent()`:
   - `processScript` writes `data/scripts/*_tts.txt` via `formatScriptForTTS`
   - `generateVideoContent` → `utils/ai-video-generator.js generateVisualAssets` (images: OpenAI `gpt-image-2`, then Gemini; with neither it writes `.info` placeholders)
   - `generateAudioNarration` → `generateTTSAudio` (ElevenLabs → OpenAI → Gemini → `.info` placeholder)
   - `generateCaptions` → `createSRTCaptions` (estimated timing)
   - `assembleVideo` → `generateVideo` (Replicate Wan 2.7 if `REPLICATE_API_KEY` is set, otherwise `generateSlideshowVideo`: Playwright stills → FFmpeg `xfade` → `addAudioToVideo`)
   - status becomes `simulated` if `finalVideo.simulated`, otherwise `ready`
6. `db.saveProductionData`, then `agents/publishing-scheduling-agent.js scheduleContent` (skipped for simulated runs)

The daily cron (`schedules/daily-automation.js`) calls the same agents.

## 2. Verdict per area

| Area | Status | Evidence |
|---|---|---|
| Express routes, API key guard, body validation | Implemented | `index.js setupAPI`, `requireAPIKey`, `validateGenerateRequestBody` |
| Capability check at startup | Implemented | `index.js logCapabilitySummary` |
| FFmpeg resolution (env → ffmpeg-static → PATH) | Implemented | `utils/ffmpeg.js getFFmpegPath` |
| TTS to a real file | Implemented, needs a key | `generateElevenLabsTTS`, `generateOpenAITTS`, `generateGeminiTTS` (Gemini PCM → FFmpeg) |
| Image generation to a real file | Implemented, needs a key | `generateOpenAIImage`, `generateGeminiImage` |
| Slideshow render | Implemented, off-brand, 16:9 only | `generateSlideshowVideo`, `renderSlidesToVideo` |
| Replicate video path | **Broken for full videos** | see 3.1 |
| Captions | **Mocked timing** | see 3.3 |
| Roblox episode package | **Documentation only** | No file in `agents/`, `utils/`, `schedules/` or `index.js` reads `content/` (repo-wide search for `content/`, `roblox`, `RHM_` matches only the `content/` folder itself) |
| Character reference PNG | **Missing** | `character-bible.md` and `prompts/image-generation.md` require `assets/character-reference.png`; not in the tree |
| EP01 thumbnail PNG | **Missing** | `assets/thumbnail-README.md` names `thumbnail-10-roblox-horror-myths.png`; not in the tree |
| Gameplay footage | **None** | Nothing in the repo; the storyboard requires it for every verdict |

## 3. Broken or incomplete code (smallest-first)

1. **Replicate branch truncates the video.** `generateReplicateVideo` passes `visualAssets[0]` (a local file path) as `image`, renders one 5-second 720p clip, then `addAudioToVideo` muxes with `-shortest`. Any run with `REPLICATE_API_KEY` set gives about 5 seconds of video and cuts the narration.
2. **Slideshow is hard-coded to the old brand.** `createSlideshowHTML` contains `Ethereal Dreamscript`, the `#667eea → #764ba2` gradient, "✨ Subscribe for More Stories ✨" and "New content daily at 2:00 PM". The viewport is fixed at 1920×1080 in `generateSlideshowVideo`, so there's no 9:16 output.
3. **Caption timing is guessed.** `createSRTCaptions` assigns a fixed 5s hook, 15s intro and `section.duration || 60` per section. It never reads the real audio length, so subtitles drift.
4. **Slide timing doesn't match the audio.** `renderSlidesToVideo` uses `calculateScriptDuration` (word count at 150 wpm), not the narration length. With `-shortest` in `addAudioToVideo`, either the picture or the voice is cut.
5. **The TTS text includes filler.** `formatScriptForTTS` reads "Section N: title" aloud, plus the `greeting` and `credibility` lines. That conflicts with `video-format-system.md` ("no greeting").
6. **No character lock in image prompts.** `createVisualPromptsFromScript` appends "ethereal dreamscape". `enhanceVisualPrompt` defaults to `ethereal`. `generateGeminiImage` sends text only, so no reference image can be attached as `image-generation.md` requires.
7. **No way to feed a written episode.** `/generate` only accepts `topic`, `style` and `length` (`validateGenerateRequestBody`). A hand-written script or storyboard can't enter the pipeline.

## 4. Character reference vs character bible

`content/roblox-horror-myth-lab-ep01/assets/character-reference.svg` shows the **old starter look**, not `character-bible.md`:

| Bible (canonical) | SVG |
|---|---|
| Silver-blue three-prong floating crown | absent |
| Premium techwear jacket, blue piping, layered shoulder panels | plain "Black zip hoodie" |
| Utility straps, black backpack with cyan-lit core, fingerless gloves | absent |
| Cyan lantern | "Dark-gray flashlight" |
| Cool-blue face accents | plain skin-tone face block |
| Palette #10131B #252C39 #1677FF #8DEBFF #C8D4E4 #F4F7FC | #151820 #303642 #f2f4f7 #3ca6ff #ffb547 |

`storyboard.md` ("Character continuity") also still describes the old look. Both need updating once a master PNG is approved.

## 5. media-fabric (local)

It has a working 9:16 pipeline, and its outputs prove it ran: `output/status_ledger.json` shows `reel_1792320291` `completed`, 30.03s, 901 frames, and `output/videos/*.mp4` exist. Stages: Edge-TTS per beat → SFX/BGM → Remotion `AffiliateReel` → thumbnails/storyboard → bundle.

Limitation: `AffiliateReel` and `templates/formats.json` are built for Indonesian affiliate product reels (price, cart CTA, claim guard). They don't fit a Roblox myth Short without a new composition. Two parts are reusable as-is: the SFX library (`output/sfx/*.wav`) and the 9:16 safe zone (top 170, bottom 440, left 64, right 150).

## 6. What can run automatically vs what needs you

- **Automatic once keys are set:** strategy, script and SEO text; TTS; still images; slideshow MP4; SRT (with drift); scheduling.
- **Needs you:**
  - Pick the Roblox experience and record gameplay footage (required for any verdict).
  - Generate and approve the master character PNG.
  - Connect YouTube OAuth (`npm run credentials:setup`).
  - Set an AI provider key.

## 7. Smallest path to a real video

**Done in this project:**
- A 30-second 9:16 teaser built as a timed animation (`EP01 Short Teaser.dc.html`), exportable to MP4 from the Share → Export → Video menu.
- Narration text, SRT and audio-mix commands in `production/ep01-short/`.

The teaser makes **no myth verdicts**, so it needs no gameplay evidence.

**Proposed repo changes (not applied; no write access to the repo from here):**
1. In `generateVideo`, skip Replicate unless the clip covers the narration length (fixes 3.1).
2. Make `createSlideshowHTML` read brand, colors and CTA from config, and add a 1080×1920 option (fixes 3.2).
3. Build the SRT from the measured TTS duration (`ffprobe`) instead of fixed blocks (fixes 3.3/3.4).
4. Add `POST /render-episode {scriptPath}` that loads a timed script JSON and skips strategy/script generation (fixes 3.7).
