# EP01 storyboard → scenes: how editing works

`production/ep01/episode.json` is the single source of truth. It was built row by row from `content/roblox-horror-myth-lab-ep01/storyboard.md` (19 rows, same timecodes, beats, visual direction, narration and edit notes). `Storyboard Studio.dc.html` loads it, plays each scene, and edits it.

## What you can change per scene
- Gameplay clip: `footage/<scene id>.mp4`. The studio picks it up automatically when the file exists; **Load clip** previews a local file without saving it.
- Voice line (`narration`). Rows where the storyboard gave a direction instead of a line are flagged `narrationIsDirection: true`.
- On-screen caption (`onScreen`, max 6 words). It sits above the video in Shorts, and as a small chip in long-form.
- SFX (`sfx`, from `sfx/*.wav`, copied from media-fabric).
- Visual direction and edit note.
- Verdict (myth scenes only). It stays locked until the scene has footage.

## What you can change for the whole episode
- Template: `longform` (1920×1080) or `shorts` (1080×1920, media-fabric safe zone).
- Background music: `sfx/bgm_warm_pad.wav`, ducked under the voice.
- Voice engine and id (`voice`). The studio previews with the browser voice; the final render should use edge-tts.

## Agent tools (same names an MCP server should expose)
| Tool | Effect on episode.json |
|---|---|
| `list_scenes()` | read all scenes |
| `update_scene({id, narration?, onScreen?, sfx?, visual?, edit?})` | edit one scene; refuses onScreen over 6 words |
| `set_template({template})` | `template` |
| `set_bgm({on})` | background music on/off |

The in-studio agent runs these tools directly. It can't set verdicts. Every edit, whether by you or the agent, is logged as the matching tool call.

## Not done yet (needs the repo pipeline)
- Final render: TTS per scene → mix → MP4 per template. See `production/AUDIT.md` §7, item 4 (`/render-episode`).
- Gameplay footage: none exists yet. Record it per the storyboard's experiment register.
