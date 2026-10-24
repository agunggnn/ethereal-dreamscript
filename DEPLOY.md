# Deploy and push

## 1. Put it on this PC
1. Unzip the download into `E:\GitHub\ethereal-dreamscript`.
2. In PowerShell, from that folder:
   ```
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
   The script:
   - installs the MCP server and edge-tts
   - writes `mcp\mcp-config.local.json`
   - prints the Claude Code and Codex commands
   - opens http://localhost:4747/Home.dc.html (live mode)
3. Later, to start it again: `cd mcp; npm run studio`.

## 2. Push to GitHub
Create an empty repo first, e.g. `agunggnn/ethereal-dreamscript`, then:
```
git init
git add .
git commit -m "Ethereal Dreamscript studio + MCP"
git branch -M main
git remote add origin https://github.com/agunggnn/ethereal-dreamscript.git
git push -u origin main
```
GitHub rejects files over 100 MB. If an `aegis/*.mp4` is larger, run `git lfs install` and `git lfs track "aegis/*.mp4"` before `git add`.

## 3. Use it remotely with an agent
- **Same network:** the studio server listens only on this PC (`127.0.0.1`). Agents running on this PC (Claude Code, Codex, Cursor, Antigravity) connect through MCP and you watch them work in live mode.
- **From another device:** run a tunnel such as `cloudflared tunnel --url http://localhost:4747` (or Tailscale). The studio server only answers to `localhost` and `127.0.0.1`, so start it with the tunnel's host name allowed: `$env:STUDIO_HOSTS = "abc.trycloudflare.com"; npm run studio` (comma-separate several). It serves only the Studio's pages and media, never `.git`, dotfiles or `mcp/` internals. It has no login, so share the tunnel URL only with yourself.
