# An Unreal level in a web browser: Pixel Streaming

Unreal renders on this computer and sends the picture as video (WebRTC) to a browser; the browser sends the keys and the mouse back. Nothing is installed on the viewer's side.
Pixel Streaming 2 ships with Unreal Engine 5.8 (`Engine\Plugins\Media\PixelStreaming2`); the web part, the **signalling server** and the **page**, does not: it comes from Epic's
repository (`EpicGames/PixelStreamingInfrastructure`, MIT, release `UE5.8-0.1.0`).

```
browser  <-- page, signalling (http://localhost:8080) -->  Wilbur (node)  <-- ws://127.0.0.1:8888 -->  Unreal (-game, no window)
browser  <------------------ video, audio, input (WebRTC, direct) ------------------------------------>  Unreal
```

## Use

```
1  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\run.ps1 -BuildOnly      # the level of the house, with a start place outside it (once, and after a new .glb)
2  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\pixelstreaming\setup.ps1 # the web part (once, about 2 minutes)
3  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\pixelstreaming\run_stream.ps1 [-Project UsableSpace|ElectricDreams]
   then open http://localhost:8080  (the script opens it)
```

In the page: click the picture, the mouse looks around (Esc lets go); W A S D fly, up and down as in Unreal's default pawn. The gear opens the settings (codec, resolution, statistics). Close Unreal or press
Ctrl+C in the console: the server stops with it. Logs are in `logs\` (git ignores them).

**Step 2 needs you at the keyboard**: it downloads one 0.6 MB archive from GitHub (checked against a SHA-256), about 1,200 npm packages (400 MB, install scripts off) and runs their build
tools. It does not use Epic's own `start.bat`, which also downloads a second Node and a TURN server and asks `api.ipify.org` for your public IP.

## The two projects

| | `UsableSpace` | `ElectricDreams` |
|---|---|---|
| what | the walk-view house in its forest, built from the `.glb` by `build_level.py` | Epic's *Electric Dreams Environment* sample (jungle, cliffs, a river; PCG), from the launcher |
| where | `pipeline\render\unreal\UsableSpace` | `Documents\Unreal Projects\ElectricDreamsEnv` (43.7 GB, UE 5.8, a prebuilt 11.9 GB derived-data pack) |
| level | `/Game/UsableSpace/Scene` | `/Game/Levels/ElectricDreams_Env` (also `/Game/Levels/PCG/ElectricDreams_PCGCloseRange`, the project's start level) |
| weight | light, its shaders are cached by the render runs | demanding: Lumen with hardware ray tracing, Nanite, virtual shadow maps, Substrate, DX12. This laptop has an RTX 5070 with 8 GB of video memory and 31 GB of RAM |

`run_stream.ps1` adds the plugin line to a project's `.uproject` when it is missing (and keeps the old file as `.bak`). Streaming the Electric Dreams level has **not been tried** on this laptop: expect a
long first start (shaders, World Partition, PCG), a low frame rate or an out-of-memory crash at the project's own settings. Lower them with the console variables of the scalability groups
(`sg.*`, `r.Lumen.HardwareRayTracing 0`, `r.RayTracing 0`) before blaming Pixel Streaming.

## Online, honestly

* On this computer and on the same network it works: `http://<address of this computer>:8080`. The signalling server listens on **all** network interfaces, without a password, and Windows asks once
  whether `node` may listen: that is your decision, nothing here changes the firewall.
* Over the internet it needs more than this folder: a TURN server for the video (most networks block a direct connection), HTTPS for the page, and a login in front. Do not forward port 8080 to the
  internet as it is: anybody who finds it can fly your session. For the presentation on 4 Nov, the same network (a hotspot) or this laptop's own browser is the safe way.
* One Unreal process serves one viewer at a time with this setup (no SFU).

## Status (2 Nov 2026)

Done and checked: the plugin exists in this engine, `UsableSpace.uproject` has it, the level script adds a `PlayerStart`, both scripts parse, the sources are downloaded and `npm ci --ignore-scripts` installed them
(1,225 packages), the *Common* library built (`tsc`). Not run by the author: the other build steps, the signalling server, the stream itself. The sandbox this was written in refused to run Epic's build
tools, so `setup.ps1` and `run_stream.ps1` are untested end to end: read `logs\` first when something does not start.
