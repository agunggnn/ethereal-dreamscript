# 07 · Bright theme QA

**Why:** the dark screens were converted to the Realm Builder palette by a script (`mcp/theme-light.js`). A script can miss spots.

**Palette:** ink `#1C2830`, muted ink `rgba(28,40,48,0.7+)`, parchment panels `#FFFBF0` → `#F6ECD4`, gold border `#C9A45C`, blue accent `#2A6A98`, green `#2F6B45`, warning `#D9A441`, error `#A3332B`. Font Manrope + JetBrains Mono.

**Check every screen for:**
- Light text left on a light panel (search for `#FFF` used as `color` on parchment).
- Text over wallpaper thumbnails without a parchment backing.
- Canvas overlays in Loop Studio (marks, element boxes) still readable on bright images.
- Focus rings on the Home tiles (PS5-style): visible on bright wallpapers.

**Done when:** every text element passes 4.5:1 contrast (use the browser accessibility checker).
