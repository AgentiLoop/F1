# AgentiLoop Racing F1 Web for Windows: opens the hosted game in a Microsoft Edge app window (Edge's built-in
# Chromium engine: WebGL, Web Audio, gamepads). No tabs or address bar, its own window, profile and taskbar icon.
#   (no switch)   install to %LOCALAPPDATA%\Programs\AgentiLoopF1-Web, add Start menu + desktop shortcuts, start it
#   -Run          just start the game from this folder (no install)
#   -Uninstall    remove the shortcuts and the installed folder
# Plain ASCII on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
param([switch]$Run, [switch]$Uninstall, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'

$Name = 'AgentiLoop Racing F1'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA 'Programs\AgentiLoopF1-Web'
$UserData = Join-Path $env:LOCALAPPDATA 'AgentiLoopF1-Web\profile'
$Links = @((Join-Path ([Environment]::GetFolderPath('Programs')) "$Name.lnk"),
           (Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk"))

if ($Uninstall) {
  $Links | ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }
  Remove-Item $Dest, (Split-Path $UserData) -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "$Name removed"
  return
}

$Url = if ($env:F1_WEB_URL) { $env:F1_WEB_URL } else { (Get-Content (Join-Path $Here 'url.txt') -TotalCount 1).Trim() }

$Edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Edge) {
  $Edge = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction SilentlyContinue).'(default)'
}
if (-not $Edge) { throw 'Microsoft Edge was not found. Install it from https://www.microsoft.com/edge and try again.' }

$EdgeArgs = "--app=`"$Url`" --user-data-dir=`"$UserData`" --window-size=1440,900 " +
            '--autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check'

if (-not $Run) {
  if ($Here -ne $Dest) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Copy-Item (Join-Path $Here '*') $Dest -Recurse -Force
  }
  $Shell = New-Object -ComObject WScript.Shell
  foreach ($Path in $Links) {
    $Lnk = $Shell.CreateShortcut($Path)
    $Lnk.TargetPath = $Edge
    $Lnk.Arguments = $EdgeArgs
    $Lnk.WorkingDirectory = $Dest
    $Lnk.IconLocation = (Join-Path $Dest 'F1.ico') + ',0'
    $Lnk.Description = 'AgentiLoop Racing F1 (plays f1.gokart.games in Microsoft Edge)'
    $Lnk.Save()
  }
  Write-Host "$Name installed: Start menu and desktop shortcuts added"
  if ($NoLaunch) { return }
}

Start-Process -FilePath $Edge -ArgumentList $EdgeArgs
