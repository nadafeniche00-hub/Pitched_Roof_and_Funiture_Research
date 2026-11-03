# Can this computer be the GPU of a Pixel Streaming session? Run it ON THE SERVER (it only reads, nothing is installed or changed):
#   powershell -ExecutionPolicy Bypass -File check_server.ps1
# It reports the graphics card, its video memory, the driver, RAM, free disk space, whether Unreal Engine is installed and whether the ports of the stream are free.
$ok = $true
function Line($name, $value, $good) { '{0,-22} {1}   {2}' -f $name, $value, $(if ($good) { 'ok' } else { '<-- problem' }); if (-not $good) { $script:ok = $false } }
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($smi) {
    $g = (& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader).Split(',') | ForEach-Object { $_.Trim() }
    $mb = [int](($g[1] -split ' ')[0])
    Line 'graphics card' $g[0] $true
    Line 'video memory' ("$mb MB (12000 or more is comfortable, 8000 is the least)") ($mb -ge 8000)
    Line 'driver' $g[2] $true
} else {
    Line 'graphics card' 'no NVIDIA card or driver found (nvidia-smi is missing): Pixel Streaming cannot run here' $false
}
$ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
Line 'memory' "$ram GB (32 or more advised)" ($ram -ge 16)
$free = [math]::Round((Get-PSDrive -Name ((Get-Location).Drive.Name)).Free / 1GB)
Line 'free disk here' "$free GB (the jungle project is 43 GB, the engine about 60 GB)" ($free -ge 110)
Line 'Unreal Engine 5.8' $(if (Test-Path 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe') { 'installed' } else { 'not installed in the default place' }) (Test-Path 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe')
foreach ($p in 8080, 8888) { Line "port $p" $(if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) { 'in use' } else { 'free' }) (-not (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) }
''
if ($ok) { 'This computer can very likely run the stream. Tell me the card name and the video memory.' } else { 'Something above is a problem: send me these lines.' }
