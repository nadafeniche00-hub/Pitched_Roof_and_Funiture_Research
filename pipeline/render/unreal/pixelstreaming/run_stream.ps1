# Streams an Unreal level into a web browser with Pixel Streaming 2: the signalling server (Epic's Wilbur, built by setup.ps1) serves the page, Unreal sends the picture and takes
# the keys and the mouse back. Needs setup.ps1 once.
#   powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\pixelstreaming\run_stream.ps1 [-Project UsableSpace|ElectricDreams] [-Map /Game/...] [-Resolution 1920x1080] [-Light] [-Mute]
# Then open http://localhost:8080 on this computer. On the same network: http://<address of this computer>:8080 (Windows asks once whether node may listen: your decision).
# Stop with Ctrl+C: Unreal and the signalling server both stop. Only one stream at a time (the ports and the 8 GB GPU are taken); a second run says so and stops.
#   UsableSpace     the walk-view house in its forest (pipeline\render\unreal, built by run.ps1), starts outside the house; W A S D and the mouse fly
#   ElectricDreams  Epic's sample project in Documents\Unreal Projects (43 GB, Lumen, Nanite, ray tracing): needs more than the 8 GB of this laptop's GPU at full quality, see README.md
#                   With the house in it (pipeline\render\unreal\house\add_house.ps1) the player begins in front of the house; -SampleStart begins where Epic's sample does.
param(
    [ValidateSet('UsableSpace', 'ElectricDreams')][string]$Project = 'UsableSpace',
    [string]$Map = '',
    [string]$Resolution = '1920x1080',
    [int]$HttpPort = 8080,
    [int]$StreamerPort = 8888,
    [ValidateSet('', 'H264', 'VP8', 'VP9', 'AV1')][string]$Codec = '',
    [switch]$SampleStart,   # ElectricDreams: begin at Epic's own start place instead of in front of the house
    [switch]$Mute,     # no sound in the browser: the jungle sample brings its own ambience (birds, crickets, grasshoppers, flies, frogs, monkeys), streamed with the picture
    [switch]$Light,    # a big project on a small GPU (Epic's Electric Dreams sample on 8 GB): no hardware ray tracing, medium scalability, 1280x720 unless -Resolution says otherwise. Not tried yet.
    [string]$Bin = 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$projects = @{
    UsableSpace    = @{ File = (Join-Path $here '..\UsableSpace\UsableSpace.uproject'); Map = '/Game/UsableSpace/Scene' }
    ElectricDreams = @{ File = (Join-Path $env:USERPROFILE 'Documents\Unreal Projects\ElectricDreamsEnv\ElectricDreamsEnv.uproject'); Map = '/Game/Levels/ElectricDreams_Env'; Start = 'UsableSpace' }
}
$cfg = $projects[$Project]
$uproject = (Resolve-Path $cfg.File).Path
$map = if ($Map) { $Map } else { $cfg.Map }
# the "#name" after a map is the portal: the player begins at the PlayerStart with that tag (house\place_house.py puts one in front of the house). A level without such a start uses its own.
if ($cfg.Start -and -not $SampleStart -and $map -notmatch '#') { $map = "$map#$($cfg.Start)" }

# the plugin must be on in the project (the .uproject gets one line and a .bak copy of the old file)
$text = Get-Content $uproject -Raw
if ($text -notmatch 'PixelStreaming2') {
    Copy-Item $uproject "$uproject.bak" -Force
    $text = [regex]::Replace($text, '"Plugins"\s*:\s*\[', '"Plugins": [' + "`r`n`t`t{ `"Name`": `"PixelStreaming2`", `"Enabled`": true },", 1)
    Set-Content $uproject $text -NoNewline
    "enabled the Pixel Streaming 2 plugin in $uproject (the old file is next to it as .bak)"
}

# 0 a stream that is still running owns the ports (the house and the jungle do not fit on the GPU together either): say so instead of talking to its server
foreach ($port in $HttpPort, $StreamerPort) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "port $port is already in use: another stream is still running. Press Ctrl+C in its terminal first (Get-Process UnrealEditor shows what is left)." }
}

# 1 the signalling server and the page
$sw = Join-Path $here 'infra\SignallingWebServer'
if (-not ((Test-Path (Join-Path $sw 'dist\index.js')) -and (Test-Path (Join-Path $sw 'www\player.html')))) { throw 'the web part is not built yet: run setup.ps1 first' }
$logs = Join-Path $here 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$sigArgs = @('dist\index.js', '--serve', '--player_port', $HttpPort, '--streamer_port', $StreamerPort, '--http_root', "`"$(Join-Path $sw 'www')`"", '--homepage', 'player.html', '--console_messages', 'verbose', '--log_config')
$sig = Start-Process -FilePath node -ArgumentList $sigArgs -WorkingDirectory $sw -PassThru -WindowStyle Minimized -RedirectStandardOutput (Join-Path $logs 'signalling.log') -RedirectStandardError (Join-Path $logs 'signalling.err.log')
try {
    $up = $false
    for ($i = 0; $i -lt 60 -and -not $up; $i++) {
        Start-Sleep -Milliseconds 500
        if ($sig.HasExited) { throw 'the signalling server stopped at once: read logs\signalling.err.log (is port ' + $HttpPort + ' taken?)' }
        try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $HttpPort); $c.Close(); $up = $true } catch { }
    }
    Start-Sleep -Milliseconds 700
    if ($sig.HasExited) { throw "the signalling server stopped right after it opened port ${HttpPort}: read logs\signalling.err.log" }
    if (-not $up) { throw "the signalling server did not open port $HttpPort" }
    "signalling server up: http://localhost:$HttpPort  (streamer port $StreamerPort, log: $logs)"

    # 2 Unreal: the level as a game without a window, streaming to the server
    if ($Light -and -not $PSBoundParameters.ContainsKey('Resolution')) { $Resolution = '1280x720' }
    $w, $h = $Resolution -split 'x'
    $ue = @("`"$uproject`"", $map, '-game', "-PixelStreamingConnectionURL=ws://127.0.0.1:$StreamerPort", '-RenderOffScreen', '-ForceRes', "-ResX=$w", "-ResY=$h", '-Windowed',
        '-AudioMixer', '-nosplash', '-nopause', '-unattended', '-stdout', '-FullStdOutLogOutput')
    if ($Mute) { $ue = @($ue | Where-Object { $_ -ne '-AudioMixer' }) + '-nosound' }
    if ($Codec) { $ue += "-PixelStreamingEncoderCodec=$Codec" }
    # the picture is sent at 60 frames a second: no point in rendering more (the house level used the whole GPU without this)
    $cmds = @('t.MaxFPS 60')
    if ($Light) {
        # Ray tracing off: the sample switches it on in its own DefaultEngine.ini, and it does not fit 8 GB. Every setting like this changes what Unreal has to build: with these ones Epic's 12 GB
        # pre-built cache (DerivedDataCache/Compressed.ddp, mounted) was NOT found for the meshes, so the FIRST start builds about 600 of them from source, at 8 to 10 a minute (2 Nov 2026: 162 after
        # 21 min). They are cached then: the next starts with the same settings are fast. Change the settings and it builds again.
        $ue += '-ini:Engine:[/Script/Engine.RendererSettings]:r.RayTracing=False'   # the sample switches ray tracing on in its own DefaultEngine.ini
        $cmds += 'r.Lumen.HardwareRayTracing 0', 'sg.ViewDistanceQuality 2', 'sg.ShadowQuality 2', 'sg.GlobalIlluminationQuality 2', 'sg.ReflectionQuality 2', 'sg.PostProcessQuality 2', 'sg.TextureQuality 2', 'sg.EffectsQuality 2', 'sg.FoliageQuality 2', 'sg.ShadingQuality 2'
    }
    $ue += ('-ExecCmds="' + ($cmds -join ',') + '"')
    "starting Unreal: $map  ($Resolution). The first start of a big level takes minutes; the page shows the picture when Unreal says it is streaming."
    $unreal = Start-Process -FilePath (Join-Path $Bin 'UnrealEditor.exe') -ArgumentList $ue -PassThru -RedirectStandardOutput (Join-Path $logs "unreal_$Project.log")
    Start-Process "http://localhost:$HttpPort" | Out-Null
    $unreal.WaitForExit()
    "Unreal ended (exit code $($unreal.ExitCode)); log: $(Join-Path $logs "unreal_$Project.log")"
} finally {
    if ($unreal -and -not $unreal.HasExited) { Stop-Process -Id $unreal.Id -Force }
    if (-not $sig.HasExited) { Stop-Process -Id $sig.Id -Force }
}
