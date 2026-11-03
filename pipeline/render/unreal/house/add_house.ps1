# Puts the house into Epic's Electric Dreams project: copies the pack (make_house_pack.py) into its Content\UsableSpace folder, then finds a spot and places the house (place_house.py).
#   powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\house\add_house.ps1            a dry run: where would the house go? (nothing is changed except the copied pack)
#   powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\house\add_house.ps1 -Apply     spawn the house and our start place and save them (a second run replaces the first)
#   powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\house\add_house.ps1 -Remove    take both actors out again and delete the folder Content\UsableSpace
# Headless, no GPU. The project must not be open in an editor that saves (a streaming run is fine). What changes in the project: the new folder Content\UsableSpace (about 10 MB),
# two new actor files under Content\__ExternalActors__ (the house, our start place), and nothing else; the level file is checked before and after.
param(
    [switch]$Apply,
    [switch]$Remove,
    [string]$Project = (Join-Path $env:USERPROFILE 'Documents\Unreal Projects\ElectricDreamsEnv'),
    [string]$Level = '/Game/Levels/ElectricDreams_Env',
    [string]$Bin = 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pack = Join-Path $here 'pack\Content\UsableSpace'
if (-not $Remove -and -not (Test-Path $pack)) { throw "no pack yet: run make_house_pack.py in the UsableSpace project first (see its header)" }
$uproject = Get-ChildItem $Project -Filter *.uproject | Select-Object -First 1
if (-not $uproject) { throw "no .uproject in $Project" }

# the level file of the sample must come out as it went in
$umap = Join-Path $Project ('Content' + ($Level -replace '^/Game', '' -replace '/', '\') + '.umap')
$before = (Get-FileHash $umap -Algorithm SHA256).Hash
$t0 = Get-Date

if (-not $Remove) {
    Copy-Item $pack (Join-Path $Project 'Content') -Recurse -Force
    "copied the pack into $(Join-Path $Project 'Content\UsableSpace')"
}

$log = Join-Path $here 'logs'
New-Item -ItemType Directory -Force -Path $log | Out-Null
Remove-Item (Join-Path $log 'place.log') -ErrorAction SilentlyContinue
$env:US_LEVEL = $Level
$env:US_APPLY = $(if ($Apply) { '1' } else { '0' })
$env:US_REMOVE = $(if ($Remove) { '1' } else { '0' })
& (Join-Path $Bin 'UnrealEditor-Cmd.exe') $uproject.FullName "-ExecutePythonScript=$(Join-Path $here 'place_house.py')" -unattended -nopause -nosplash -nullrhi -stdout -AutoDeclinePackageRecovery *> (Join-Path $log 'place_editor.log')
if (Test-Path (Join-Path $log 'place.log')) { Get-Content (Join-Path $log 'place.log') } else { Get-Content (Join-Path $log 'place_editor.log') -Tail 20 }

if ($Remove -and (Test-Path (Join-Path $Project 'Content\UsableSpace'))) {
    Remove-Item (Join-Path $Project 'Content\UsableSpace') -Recurse -Force
    "deleted $(Join-Path $Project 'Content\UsableSpace')"
}
$after = (Get-FileHash $umap -Algorithm SHA256).Hash
"level file unchanged: $($before -eq $after)"
"files written under __ExternalActors__ since the start:"
Get-ChildItem (Join-Path $Project 'Content\__ExternalActors__') -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $t0 } | ForEach-Object { '   {0}  {1:N0} KB' -f $_.FullName.Substring($Project.Length), ($_.Length / 1KB) }
