# Ethereal Dreamscript: one-time setup on this PC (Windows PowerShell)
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Project: $root"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Install Node.js 18+ from https://nodejs.org, then run this again." -ForegroundColor Yellow; exit 1 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "Python not found. Voice synthesis needs Python 3 (https://python.org)." -ForegroundColor Yellow }
else { python -m pip install --upgrade edge-tts }

Push-Location "$root\mcp"; npm install; Pop-Location

$cfg = @{ mcpServers = @{ dreamscript = @{ command = "node"; args = @("$root\mcp\server.mjs"); env = @{ DREAMSCRIPT_ROOT = "$root" } } } } | ConvertTo-Json -Depth 6
Set-Content -Path "$root\mcp\mcp-config.local.json" -Value $cfg
Write-Host "`nMCP config written to mcp\mcp-config.local.json (paste into Claude Desktop / Cursor)."
Write-Host "Claude Code:  claude mcp add dreamscript -e DREAMSCRIPT_ROOT=`"$root`" -- node `"$root\mcp\server.mjs`""
Write-Host "Codex (~/.codex/config.toml):`n[mcp_servers.dreamscript]`ncommand = `"node`"`nargs = [`"$($root -replace '\\','\\')\\mcp\\server.mjs`"]`nenv = { DREAMSCRIPT_ROOT = `"$($root -replace '\\','\\')`" }"

$csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64\*\csc.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
if ($csc -and (Test-Path "$root\mcp\launcher.cs")) {
  $icoArg = if (Test-Path "$root\assets\icon.ico") { "/win32icon:`"$root\assets\icon.ico`"" } else { "" }
  & $csc /nologo /target:winexe $icoArg /out:"$root\DreamscriptStudio.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$root\mcp\launcher.cs"
  $sm = [Environment]::GetFolderPath("Programs")
  $wsh = New-Object -ComObject WScript.Shell
  $lnk = $wsh.CreateShortcut("$sm\Ethereal Dreamscript Studio.lnk")
  $lnk.TargetPath = "$root\DreamscriptStudio.exe"
  $lnk.WorkingDirectory = $root
  if (Test-Path "$root\assets\icon.ico") { $lnk.IconLocation = "$root\assets\icon.ico,0" }
  $lnk.Description = "Start Ethereal Dreamscript Studio in background and open UI"
  $lnk.Save()
  Write-Host "`nBuilt DreamscriptStudio.exe and added 'Ethereal Dreamscript Studio' to Start Menu launcher." -ForegroundColor Green
}

Write-Host "`nStarting Studio on http://localhost:4747/Home.dc.html  (Ctrl+C to stop)" -ForegroundColor Cyan
Start-Process "http://localhost:4747/Home.dc.html"
Push-Location "$root\mcp"; npm run studio; Pop-Location
