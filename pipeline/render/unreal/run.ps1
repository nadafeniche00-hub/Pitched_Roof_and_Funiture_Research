# Unreal Engine 5.8: the scene of pipeline\render\in\scene.glb as a level, and pictures of it (pipeline\render\out\unreal_<shot>.png).
#   powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\run.ps1 [-Warmup 60] [-Diag 1|each] [-SkipBuild]
# 1  build_level.py in a headless editor (-nullrhi): import the glb as a scene, own materials, sun, sky, fog; saves the level
# 2  render_shots.py in a rendering editor without a window (-RenderOffscreen): scene-capture cameras write the pictures, the editor quits
# The first run compiles shaders (minutes); the cache in UsableSpace\DerivedDataCache keeps them. Logs: build_level.log, render_shots.log (next to this file).
param(
    [string]$Bin = "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64",
    [int]$Warmup = 60,       # seconds the shot script waits after its setup before the first picture
    [string]$Diag = "",      # "1" or "each": the diagnostic shots of render_shots.py instead of the three pictures
    [switch]$SkipBuild       # take the level of the last run, only render
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$project = Join-Path $here "UsableSpace\UsableSpace.uproject"
$content = Join-Path $here "UsableSpace\Content\UsableSpace"
$level = Join-Path $content "Scene.umap"

Remove-Item (Join-Path $here "UsableSpace\Saved\Autosaves") -Recurse -Force -ErrorAction SilentlyContinue
if (-not $SkipBuild) { Remove-Item (Join-Path $here "script.log") -ErrorAction SilentlyContinue }
if (-not $SkipBuild) {
    Remove-Item $content -Recurse -Force -ErrorAction SilentlyContinue   # a clean start: see build_level.py
    & (Join-Path $Bin "UnrealEditor-Cmd.exe") $project "-ExecutePythonScript=$here\build_level.py" -unattended -nopause -nosplash -nullrhi -stdout -AutoDeclinePackageRecovery *> (Join-Path $here "build_level.log")
}
if (-not (Test-Path $level) -or (Get-Item $level).Length -lt 100000) {
    throw "the level was not built (no Scene.umap, or an empty one): read build_level.log"
}
Write-Host "level: $((Get-Item $level).Length) bytes"

$env:US_SHOTS = "1"
$env:US_WARMUP = "$Warmup"
if ($Diag) { $env:US_DIAG = $Diag } else { Remove-Item Env:\US_DIAG -ErrorAction SilentlyContinue }
$editorArgs = @("`"$project`"", "-RenderOffscreen", "-nosplash", "-nopause", "-windowed", "-unattended", "-AutoDeclinePackageRecovery", "-stdout")
Start-Process -FilePath (Join-Path $Bin "UnrealEditor.exe") -ArgumentList $editorArgs -Wait -RedirectStandardOutput (Join-Path $here "render_shots.log")
if (Test-Path (Join-Path $here "script.log")) { Get-Content (Join-Path $here "script.log") }   # what the two scripts said (they cannot write to the editor's log in this mode)
Get-ChildItem (Join-Path $here "..\out") -Filter "unreal_*.png" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
