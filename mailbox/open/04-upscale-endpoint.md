# 04 · Sharpen free images (upscale)

**Why:** Pollinations output is soft. The browser can't run an upscaler.

**Do:**
1. Install Real-ESRGAN ncnn-vulkan (Windows build, works on 8 GB VRAM): put the exe in `tools/realesrgan/`.
2. In `mcp/studio-server.mjs` add `POST /api/upscale/<realmId>/<version>`: reads the version image, runs `realesrgan-ncnn-vulkan -i in -o out -n realesrgan-x4plus -s 2`, saves `production/realms/<id>-v<n>-hd.jpg`, returns `{ url }`.
3. In `Realm Builder.dc.html`, add an **Upscale** button in the History strip that calls it and adds the result as a new version labelled `HD`.

**Done when:** a 1920×1080 Pollinations version becomes a sharp 3840×2160 version in under a minute.
