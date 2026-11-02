# Reads the roof types of the German Revit 2025 project templates with Revit's own API.
# RUN THIS YOURSELF (it starts Revit and installs a small add-in for the length of the run):
#   1. builds the add-in (dotnet), 2. copies it into %APPDATA%\Autodesk\Revit\Addins\2025,
#   3. starts Revit: when Revit asks about the unsigned add-in "UsableSpaceTemplateExport", choose "Load Once" (Einmal laden),
#   4. waits for roof_templates.json, 5. removes the add-in again. Close Revit yourself afterwards.
# Output: pipeline\data\revit\roof_templates.json
param([int]$TimeoutSeconds = 600)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here '..\..\..')
$out = Join-Path $repo 'pipeline\data\revit'
$work = Join-Path $out '_run'
$addins = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2025'
$revit = 'C:\Program Files\Autodesk\Revit 2025\Revit.exe'
New-Item -ItemType Directory -Force -Path $work | Out-Null
Remove-Item (Join-Path $work '*') -Force -ErrorAction SilentlyContinue

& dotnet build (Join-Path $here 'TemplateExport.csproj') -c Release -o (Join-Path $here 'bin') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

@(
  'C:\ProgramData\Autodesk\RVT 2025\Templates\German\BIM_Architektur_und_Ingenieurbau.rte',
  'C:\ProgramData\Autodesk\RVT 2025\Templates\German\BIM_Architektur_und_Ingenieurbau-Vereinfacht.rte',
  'C:\ProgramData\Autodesk\RVT 2025\Templates\Default_M_DEU.rte',
  'C:\ProgramData\Autodesk\RVT 2025\Templates\Default_M_DEU_ADSK.rte'
) | Where-Object { Test-Path $_ } | Set-Content -Encoding UTF8 (Join-Path $work 'templates.txt')

Copy-Item (Join-Path $here 'bin\TemplateExport.dll') $addins -Force
Copy-Item (Join-Path $here 'TemplateExport.addin') $addins -Force
try {
  $env:TPL_EXPORT_DIR = $work
  Start-Process -FilePath $revit -ArgumentList '/nosplash' | Out-Null
  'Revit is starting. Choose "Load Once" if it asks about the add-in. Waiting for the export ...'
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Seconds 3
    if ((Test-Path (Join-Path $work 'done.txt')) -or (Test-Path (Join-Path $work 'error.txt'))) { break }
  }
} finally {
  Remove-Item (Join-Path $addins 'TemplateExport.dll'), (Join-Path $addins 'TemplateExport.addin') -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $work 'roof_templates.json')) {
  Copy-Item (Join-Path $work 'roof_templates.json') (Join-Path $out 'roof_templates.json') -Force
  'ok: ' + (Join-Path $out 'roof_templates.json') + '  (you can close Revit now)'
} elseif (Test-Path (Join-Path $work 'error.txt')) { Get-Content (Join-Path $work 'error.txt') } else { 'no output yet: did Revit run the add-in? (prompt, licence)' }
