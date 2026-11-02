# Builds the DEMO project in Revit 2025 from the plan of the app: walls extruded from the technical plan (36.5 and 11.5 cm), floors, the roof of the German template, openings,
# a floor plan with the cut walls filled black and three 3D views - saved as DEMO.rvt, with a picture of each view.
# RUN THIS YOURSELF (it starts Revit and installs a small, unsigned add-in for the length of the run):
#   1. builds the add-in (dotnet), 2. copies it into %APPDATA%\Autodesk\Revit\Addins\2025,
#   3. starts Revit: when Revit asks about the unsigned add-in "UsableSpaceDemoBuild", choose "Load Once" (Einmal laden),
#   4. waits for done.txt (the project is built, saved and its pictures exported), 5. removes the add-in again. Close Revit yourself afterwards.
# The plan: the app writes it ("Revit" in the export menu of the walk view) to pipeline\data\revit_demo\demo.json; without it the sample next to this script is used.
# Output in pipeline\data\revit_demo: DEMO.rvt, revit_exterior|section|cutaway|plan.png, demo_log.txt (read it first); a copy of the project in Documents\Usable Space;
# and, when the Python environment of the repository exists, presentation\img\revit_*.jpg for the deck.
param([int]$TimeoutSeconds = 900)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here '..\..\..')
$out = Join-Path $repo 'pipeline\data\revit_demo'
$addins = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2025'
$revit = 'C:\Program Files\Autodesk\Revit 2025\Revit.exe'
if (-not (Test-Path $revit)) { throw "Revit 2025 is not installed at $revit (the licence is Autodesk's: the Blender route needs none, see pipeline\render\README.md)" }
if (Get-Process -Name Revit -ErrorAction SilentlyContinue) { throw 'Revit is already running: close it first, an add-in is loaded when Revit starts.' }
New-Item -ItemType Directory -Force -Path $out | Out-Null
if (-not (Test-Path (Join-Path $out 'demo.json'))) { Copy-Item (Join-Path $here 'sample_demo.json') (Join-Path $out 'demo.json'); 'No plan from the app yet: using sample_demo.json.' }
foreach ($f in 'done.txt', 'error.txt', 'demo_log.txt', 'DEMO.rvt', 'revit_exterior.png', 'revit_section.png', 'revit_cutaway.png', 'revit_plan.png') { Remove-Item (Join-Path $out $f) -Force -ErrorAction SilentlyContinue }

& dotnet build (Join-Path $here 'DemoBuild.csproj') -c Release -o (Join-Path $here 'bin') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'build failed (dotnet build -c Release in pipeline\revit\DemoBuild shows why)' }

New-Item -ItemType Directory -Force -Path $addins | Out-Null
Copy-Item (Join-Path $here 'bin\DemoBuild.dll') $addins -Force
Copy-Item (Join-Path $here 'DemoBuild.addin') $addins -Force
try {
  $env:DEMO_DIR = $out
  Start-Process -FilePath $revit -ArgumentList '/nosplash' | Out-Null
  'Revit is starting. Choose "Load Once" if it asks about the add-in. Waiting for the build ...'
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Seconds 3
    if ((Test-Path (Join-Path $out 'done.txt')) -or (Test-Path (Join-Path $out 'error.txt'))) { break }
  }
} finally {
  Remove-Item (Join-Path $addins 'DemoBuild.dll'), (Join-Path $addins 'DemoBuild.addin') -Force -ErrorAction SilentlyContinue
}

$log = Join-Path $out 'demo_log.txt'
if (Test-Path $log) { '--- demo_log.txt ---'; Get-Content $log }
if (Test-Path (Join-Path $out 'error.txt')) { '--- error.txt ---'; Get-Content (Join-Path $out 'error.txt'); return }
if (-not (Test-Path (Join-Path $out 'done.txt'))) { 'no result yet: did Revit run the add-in? (the prompt, the licence, a dialog waiting in Revit)'; return }

$py = Join-Path $repo '.venv\Scripts\python.exe'
if (Test-Path $py) { & $py -I (Join-Path $here '..\deck_images.py') $out (Join-Path $repo 'presentation\img') exterior section cutaway plan }
else { 'no .venv: convert the revit_*.png yourself with pipeline\revit\deck_images.py to put them in the deck' }
'ok: ' + (Join-Path $out 'DEMO.rvt') + '  (you can close Revit now; rebuild the deck with: node presentation\build.mjs)'
