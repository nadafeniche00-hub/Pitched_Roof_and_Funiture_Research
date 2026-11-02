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

In the page: click the picture, the mouse looks around (Esc lets go); W A S D fly, up and down as in Unreal's default pawn. The gear opens the settings (codec, resolution, statistics). Press
Ctrl+C in the console: Unreal and the server both stop. One stream at a time: a second run stops with a message about the ports (the house and the jungle do not share the GPU either). Logs are in `logs\` (git ignores them).

**Step 2 needs you at the keyboard**: it downloads one 0.6 MB archive from GitHub (checked against a SHA-256), about 1,200 npm packages (400 MB, install scripts off) and runs their build
tools. It does not use Epic's own `start.bat`, which also downloads a second Node and a TURN server and asks `api.ipify.org` for your public IP.

## The two projects

| | `UsableSpace` | `ElectricDreams` |
|---|---|---|
| what | the walk-view house in its forest, built from the `.glb` by `build_level.py` | Epic's *Electric Dreams Environment* sample (jungle, cliffs, a river; PCG), from the launcher |
| where | `pipeline\render\unreal\UsableSpace` | `Documents\Unreal Projects\ElectricDreamsEnv` (43.7 GB, UE 5.8, a prebuilt 11.9 GB derived-data pack) |
| level | `/Game/UsableSpace/Scene` | `/Game/Levels/ElectricDreams_Env` (also `/Game/Levels/PCG/ElectricDreams_PCGCloseRange`, the project's start level) |
| weight | light, its shaders are cached by the render runs | demanding: Lumen with hardware ray tracing, Nanite, virtual shadow maps, Substrate, DX12. This laptop has an RTX 5070 with 8 GB of video memory and 31 GB of RAM |

`run_stream.ps1` adds the plugin line to a project's `.uproject` when it is missing (and keeps the old file as `.bak`).

**Electric Dreams:** `run_stream.ps1 -Project ElectricDreams -Light` (stop the house stream first: the two do not fit on 8 GB). `-Light` switches hardware ray tracing off, sets the scalability groups to medium
and streams 1280x720; it is a guess that has **not been tried**. Streaming this level has not been tried either: expect a long first start (shaders for thousands of materials, World Partition cells), and a low
frame rate or an out-of-memory crash if it is too much. Look at `logs\unreal_ElectricDreams.log` before blaming Pixel Streaming: the page says "click to start" as soon as Unreal has joined the server, long before the
first picture is ready.

What `probe_level.py` found out about the level without opening a window (2 Nov 2026, `UnrealEditor-Cmd -nullrhi`): it loads with this engine (the project's prebuilt modules carry the build id of UE 5.8.4, so no Visual
Studio is needed); it is a World Partition map with the game mode `GM_AnimSandbox` (a character you walk with W A S D and the mouse, not a free camera); the one `PlayerStart` is at (81188, -14778, 2444) cm, among 87
cinematic cameras of the sample's beauty shots, so a viewer starts in the part of the jungle Epic composed.

## Online, honestly

* On this computer and on the same network it works: `http://<address of this computer>:8080`. The signalling server listens on **all** network interfaces, without a password, and Windows asks once
  whether `node` may listen: that is your decision, nothing here changes the firewall.
* Over the internet it needs more than this folder: a TURN server for the video (most networks block a direct connection), HTTPS for the page, and a login in front. Do not forward port 8080 to the
  internet as it is: anybody who finds it can fly your session. For the presentation on 4 Nov, the same network (a hotspot) or this laptop's own browser is the safe way.
* Several browsers can watch one session (a second one joined while the first was connected), but they all steer the same camera, and every viewer costs the GPU one more video encode (Epic's SFU, not set up
  here, avoids that).

## Status (2 Nov 2026)

Done and checked: the plugin exists in this engine, `UsableSpace.uproject` has it, the level script adds a `PlayerStart`, the sources are downloaded and `npm ci --ignore-scripts` installed them
(1,225 packages). `setup.ps1` ran to the end on Node 26.13.0 (Epic asks for 22.14.0; only the warning appeared): all the `tsc` builds, the webpack page (`www\player.html`) and the server (`dist\index.js`).
**The house streams** (2 Nov 2026, 21:24): the signalling server came up, Unreal registered as `DefaultStreamer` 3 seconds after it started, the browser of the user and the in-app browser both played the picture with
video, audio and input tracks active. The sandbox this was written in refuses to run Epic's server code, so the server was started by the user: read `logs\` first when something does not start.
