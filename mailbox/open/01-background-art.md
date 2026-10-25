# 01 · Replace the UI background art

**Why:** the design agent cannot make images. The bright theme now uses `aegis/05_floating_sky_citadel_4k.jpg` (and `aegis/09_autumn_dragon_valley_4k.jpg` on Home) as a stand-in. The creator wants a bright fantasy look: warm sand, green plains, blue sky with clouds, a distant city. The stand-in is close, but it's busy behind panels.

**Do:**
1. Generate 3 candidates with Gemini (best results so far), 3840×2160, prompt:
   `Bright painterly fantasy world vista for a menu background. Warm golden sand dunes in the foreground, green grassland and an oasis river in the middle, a distant sandstone city with tall towers, bright clear blue sky with soft white clouds, sunny midday light. Calm, low detail in the center and lower half so menus stay readable. No text, no people, no logos.`
2. Let the creator pick one.
3. Save as `assets/bg/ui_realm.jpg` (JPEG, quality 85, under 1.5 MB) and `assets/bg/ui_realm_1080.jpg` (1920×1080).
4. Replace `aegis/05_floating_sky_citadel_4k.jpg` with `assets/bg/ui_realm_1080.jpg` in: `Realm Builder.dc.html` (root div background), `Home.dc.html` (`const W` and `REALM_BG`), and the `html,body` rule in `Storyboard Studio`, `Loop Studio`, `Channel`, `Template Hub`, `Audio Lab`.

**Urgent, do first even without new art:** the screens load the 4K stand-ins (1.8 MB each), which slows the first paint. Make 1920×1080 copies at quality ~80 (`ffmpeg -i aegis/05_floating_sky_citadel_4k.jpg -vf scale=1920:-1 -q:v 4 assets/bg/sky_citadel_1080.jpg`, same for `09_autumn_dragon_valley_4k.jpg` → `assets/bg/dragon_valley_1080.jpg`), then search-replace the `aegis/0…_4k.jpg` paths in all `*.dc.html` and `mcp/theme-light.js`. The design environment couldn't decode the 4K files to do this itself.

**Done when:** every screen shows the new image and all text on panels still passes 4.5:1 contrast.
