# The house in the jungle, the lean way

The house of the walk view, put into Epic's *Electric Dreams* jungle (the sample in `Documents\Unreal Projects\ElectricDreamsEnv`), and the viewer starts in front of it. Nothing of Epic's is edited:
the project only gets one folder and two actors more.

```
UsableSpace project                         Electric Dreams project
  /Game/UsableSpace/Scene   (the level of the walk view: house + forest + furniture, 309,000 vertices)
        |  make_house_pack.py      keeps the house shell only: 39 parts, 6,775 vertices
        v
  house\pack\Content\UsableSpace   (one merged mesh + 12 material instances + 3 materials + 6 textures, 9.8 MB)
        |  add_house.ps1           copies the pack into  Content\UsableSpace , then place_house.py:
        v
  one StaticMeshActor "UsableSpaceHouse"     the house, pivot at the centre of its footprint on the ground
  one PlayerStart "PlayerStart_UsableSpace"  tag UsableSpace, 20 m from the house, looking at it
        |  run_stream.ps1 -Project ElectricDreams     starts the map as  /Game/Levels/ElectricDreams_Env#UsableSpace
        v
  the browser: the jungle, the house in front of you
```

## What makes it lean

| | the scene of the walk view | what goes into the jungle |
|---|---|---|
| vertices | 308,883 | 6,715 (one mesh, LOD 0) |
| actors | 889 (771 of them meshes) | 1 house + 1 start place |
| vegetation, ground | 679 actors, ~270,000 vertices | none: the jungle brings its own |
| furniture | 52 actors with their own textures | none: the jungle sees the house from outside |
| textures | 6 (roof tiles and floor boards: colour, normal, roughness) | the same 6, capped in the jungle project at 1024 / 1024 / 512 px for the roof and 512 / 512 / 256 px for the floor |
| on disk | | 9.8 MB for the pack |
| collision | | the mesh itself (complex as simple, 7,000 vertices): the player stops at the walls and walks on the floor |
| mobility | | static: no per-frame cost, nothing for Lumen to track |

The two actors are in the outliner folder `UsableSpace`. The `PlayerStart` is not spatially loaded (Unreal's default for start places), the house is, like every static mesh of the World Partition map: it
streams in with the cell it stands in.

## Run it

```
1  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\run.ps1 -BuildOnly                       # the level of the walk view (once, and after a new .glb)
2  "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" pipeline\render\unreal\UsableSpace\UsableSpace.uproject ^
       -ExecutePythonScript=pipeline\render\unreal\house\make_house_pack.py -unattended -nopause -nosplash -RenderOffScreen -stdout -AutoDeclinePackageRecovery
                                                                                                            # the pack (needs the renderer: without it the merge loses the materials)
3  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\house\add_house.ps1                      # a dry run: where would the house go?
4  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\house\add_house.ps1 -Apply               # put it there (a second run replaces the first)
5  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\pixelstreaming\run_stream.ps1 -Project ElectricDreams -Light -Mute
```

`add_house.ps1` runs Unreal headless (no window, no GPU), compares the hash of the sample's level file before and after (`level file unchanged: ...`) and lists the files written under
`Content\__ExternalActors__`. A second `-Apply` moves the two actors of the first (it never makes a second copy); `-Remove` takes both out again and deletes `Content\UsableSpace`.
`run_stream.ps1 -SampleStart` begins where Epic's sample begins instead. The answers of the scripts are in `logs\` (git ignores it): `pack.log`, `place.log`.

## What the first run changed in Epic's project (2 Nov 2026, 23:18)

* `Content\UsableSpace` (22 files, 9.83 MB): the pack.
* `Content\__ExternalActors__\Levels\ElectricDreams_Env\...`: two files of 4.5 KB and 4.4 KB, the house and the start place (World Partition keeps every actor in a file of its own).
* `Content\__ExternalObjects__\Levels\ElectricDreams_Env\...`: one file of 1.9 KB, the outliner folder `UsableSpace` that both actors sit in.
* **`Content\Levels\ElectricDreams_Env.umap` was rewritten** (524,234 bytes, `level file unchanged: False`): the first version of the script saved with *Save Current Level*, which writes the level file
  again even though adding actors does not change it. The script now saves only the packages that are new (the actors, the textures) and falls back to the level save only if Unreal keeps them
  dirty. That path has run once without anything to save (a second `-Apply` that moved the actors to where they already were); it has not yet saved a changed actor. The sample's own
  `.umap` is the one file here that is not ours: if it matters, the launcher can verify/repair the project.

## Where the house stands, and why there

`place_house.py` looks for it with line traces against the loaded level (in the headless editor, so no GPU): a footprint of 10.4 x 12.4 m (the house with 1.5 m of free ground round it) on **one
flat piece of landscape, with nothing solid up to the height of the house (9 m)**, and for the viewer a clear line to the house from a flat spot 20 m away.

What `probe_landscape.py` found out about the ground round the sample's own start place (81188, -14778, 2444 cm):

* Under the start place a rock mesh stops every trace, so the ground there cannot be read. It is not a place to put a house.
* East, north and south of it the landscape is **one wide flat floor at z = 1100 cm** (the dry river bed of the sample: it has `BPP_DriedRapid` actors), with no solid mesh above it. 42 of the 120 spots the
  script tries are flat and free there. The house stands on that floor, 16 m east of the start place and 13 m below it.
* West of the start place the terrain climbs to 27 to 37 m, with rock meshes: no place for a house.

The sample's trees, ferns and ground cover are made at run time by its PCG graphs, they are not in the level file, so the script cannot see them: some may grow through the house. If so, move the house
(change the numbers in `place_house.py`, run `add_house.ps1 -Apply` again) or switch the graph off for that cell.

## What it has not been checked against

The picture. Everything above is geometry read by traces; whether the house looks right in the jungle (orientation, lighting, plants growing through it) is decided in the stream.

## The standard view and the pictures for the deck (3 Nov 2026, 15:20)

The viewer starts where the user stood when the picture looked right: `start_pose.txt` (x y z pitch yaw roll of the view, in cm and degrees), set by `set_start.py` as the place of `PlayerStart_UsableSpace`
(headless like `place_house.py`; the house stays where it is). Place and direction come across, the **tilt does not**: the player flies a `BP_OpalHoverDrone` with its own camera manager, and
`set_control_rotation` or the pawn's rotation do not keep a pitch (tried on 3 Nov), so the view is level. `hover_info.py` keeps the live pose in `logs\pov.log` (twice a second) if a new view is wanted: stand there, copy the line into `start_pose.txt`, run `set_start.py`.

`run_stream.ps1 -Capture` (with `-Clean`, no red on-screen messages) is how the deck picture was made: `start_look.py` locks the keys and mouse of every viewer, waits, saves two 1920x1080 pictures to `shots\standard_1.png` and `standard_2.png`
(HighResShot: no buttons, no warnings) and gives the input back. `presentation\img\render_unreal_jungle.jpg` is `standard_2.png` cropped to 1500 x 637 (the box of slide 9, `object-fit: cover`), top at y 100.
