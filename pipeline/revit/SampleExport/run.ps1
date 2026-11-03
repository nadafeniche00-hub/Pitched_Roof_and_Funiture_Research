# Reads the architecture samples of Revit 2025 with Revit's own API: levels, rooms and their areas, roofs with their slopes, and the attic storey (Dachgeschoss) in detail.
# RUN THIS YOURSELF (it starts Revit and installs a small add-in for the length of the run):
#   1. builds the add-in (dotnet), 2. copies it into %APPDATA%\Autodesk\Revit\Addins\2025,
#   3. starts Revit: when Revit asks about the unsigned add-in "UsableSpaceSampleExport", choose "Load Once" (Einmal laden),
#   4. waits for samples.json, 5. removes the add-in again. Close Revit yourself afterwards. The samples are opened read only and never saved.
# Output: pipeline\data\revit\samples.json, then:  node pipeline\revit\convert_sample.mjs
param(
  [string[]]$Sample = @(
    'C:\Program Files\Autodesk\Revit 2025\Samples\BIM_Projekt_Golden_Nugget-Architektur_und_Ingenieurbau.rvt',
    'C:\Program Files\Autodesk\Revit 2025\Samples\Snowdon Towers Sample Architectural.rvt',
    'C:\Program Files\Autodesk\Revit 2025\Samples\サンプル意匠.rvt'
  ),
  [int]$TimeoutSeconds = 1500
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here '..\..\..')
$out = Join-Path $repo 'pipeline\data\revit'
$work = Join-Path $out '_sample_run'
$addins = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2025'
$revit = 'C:\Program Files\Autodesk\Revit 2025\Revit.exe'
$found = @($Sample | Where-Object { Test-Path -LiteralPath $_ })
foreach ($s in $Sample) { if (-not (Test-Path -LiteralPath $s)) { Write-Warning "sample not found, skipped: $s" } }
if (-not $found.Count) { throw 'none of the samples was found (pass -Sample with the paths of the .rvt files)' }
New-Item -ItemType Directory -Force -Path $work | Out-Null
Remove-Item (Join-Path $work '*') -Force -ErrorAction SilentlyContinue

& dotnet build (Join-Path $here 'SampleExport.csproj') -c Release -o (Join-Path $here 'bin') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

Set-Content -Encoding UTF8 (Join-Path $work 'samples.txt') $found

Copy-Item (Join-Path $here 'bin\SampleExport.dll') $addins -Force
Copy-Item (Join-Path $here 'SampleExport.addin') $addins -Force
try {
  $env:SAMPLE_EXPORT_DIR = $work
  Start-Process -FilePath $revit -ArgumentList '/nosplash' | Out-Null
  "Revit is starting. Choose `"Load Once`" if it asks about the add-in. Reading $($found.Count) samples (a few minutes each) ..."
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Seconds 3
    if ((Test-Path (Join-Path $work 'done.txt')) -or (Test-Path (Join-Path $work 'error.txt'))) { break }
  }
} finally {
  Remove-Item (Join-Path $addins 'SampleExport.dll'), (Join-Path $addins 'SampleExport.addin') -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $work 'samples.json')) {
  Copy-Item (Join-Path $work 'samples.json') (Join-Path $out 'samples.json') -Force
  if (Test-Path (Join-Path $work 'export_log.txt')) { Get-Content (Join-Path $work 'export_log.txt') }
  'ok: ' + (Join-Path $out 'samples.json') + '  (you can close Revit now; next: node pipeline\revit\convert_sample.mjs)'
} elseif (Test-Path (Join-Path $work 'error.txt')) { Get-Content (Join-Path $work 'error.txt') } else { 'no output yet: did Revit run the add-in? (prompt, licence)' }
