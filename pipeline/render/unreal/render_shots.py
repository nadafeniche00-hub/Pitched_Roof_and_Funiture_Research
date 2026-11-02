"""Take pictures of the Unreal level made by build_level.py with scene-capture cameras (they render into a texture, so no editor viewport is needed).
Needs a rendering editor (not -nullrhi), without a visible window:

    set US_SHOTS=1
    "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe" pipeline\\render\\unreal\\UsableSpace\\UsableSpace.uproject -RenderOffscreen -nosplash -nopause -windowed

The script is started by Content/Python/init_unreal.py when US_SHOTS is set (-ExecutePythonScript would quit the editor as soon as the script returns).
The first start compiles shaders (minutes); the cache keeps them for the next start (US_WARMUP seconds of waiting is then plenty).
Daylight only: the sun and the sky of the level, the engine's own (automatic) exposure, no other lights.
Pictures: pipeline/render/out/unreal_<shot>.png (or .bmp/.hdr, whatever the engine writes for the render target)
"""
import math
import os
import time

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("US_OUT") or os.path.normpath(os.path.join(HERE, "..", "out"))
WARMUP = float(os.environ.get("US_WARMUP", "60"))  # seconds of wall-clock time before the first picture
CAPTURES = int(os.environ.get("US_CAPTURES", "50"))  # captures per picture: the sky light and the exposure settle over a few frames
W, H = 1920, 1200
os.makedirs(OUT, exist_ok=True)
P = "[unreal-shots]"


def say(*parts):
    """neither print() nor unreal.log reach the log of the editor in this mode: the messages are also appended to script.log next to this file"""
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(os.path.join(HERE, "script.log"), "a", encoding="utf-8") as f:
        f.write(msg + "\n")

LEVEL = "/Game/UsableSpace/Scene"

eas = ues = None  # the editor subsystems exist only once the editor is up: fetched in setup()

# the house in Unreal's frame (cm, Z up): 8 m along X, 10 m along Y, attic floor at z = 0, ground at z = -300. The windows are in the gables at y = 0 and y = 1000.
C = unreal.Vector(400, 500, 0)
GROUND = -300.0


def look(frm, to):
    d = to - frm
    return unreal.Rotator(0, math.degrees(math.atan2(d.z, math.hypot(d.x, d.y))), math.degrees(math.atan2(d.y, d.x)))  # Rotator(roll, pitch, yaw)


def around(az, dist, height):
    """a point on a circle round the house; az in degrees, 0 = +X, 90 = +Y"""
    a = math.radians(az)
    return unreal.Vector(C.x + math.cos(a) * dist, C.y + math.sin(a) * dist, GROUND + height)


SENSOR = 36.0  # mm, full frame width: the focal lengths below mean the same as in the Blender pictures
SHOTS = [
    # name, position, target, focal length (mm), roof hidden, sun (pitch, yaw: the direction the light travels), extras
    ("exterior", around(235, 1850, 170), unreal.Vector(400, 500, 150), 28, False, (-42, 35), {}),
    ("exterior_back", around(55, 1850, 170), unreal.Vector(400, 500, 150), 28, False, (-42, 215), {}),
    ("cutaway", around(180, 1500, 1500), unreal.Vector(400, 500, 0), 30, True, (-50, 20), {}),
]
EV = float(os.environ.get("US_EV", "0.5"))  # the exposure (EV100) of every picture: chosen once, from a test of 0.5, 1.5 and 2.5 on the exterior and the cutaway
CVARS = ["r.Shadow.Virtual.Enable 1", "r.DynamicGlobalIlluminationMethod 1", "r.ReflectionMethod 1", "r.Nanite 1"]  # what every picture starts from; a shot's "cvars" come after
if os.environ.get("US_DIAG") == "ev":  # the exterior and the cutaway at three exposures: to choose the one that is used for all
    SHOTS = [(f"ev{ev}_{s[0]}", *s[1:6], {"ev": ev}) for ev in (0.5, 1.5, 2.5) for s in (SHOTS[0], SHOTS[2])]
elif os.environ.get("US_DIAG") == "flags":  # the exterior with one show flag off at a time
    SHOTS = [("flags_base", *SHOTS[0][1:6], {})] + [(f"flags_no_{f}", *SHOTS[0][1:6], {"flags_off": [f]}) for f in (
        "Atmosphere", "Fog", "GlobalIllumination", "AmbientOcclusion", "DynamicShadows", "ReflectionEnvironment", "ScreenSpaceReflections", "DistanceFieldAO",
        "VolumetricFog", "Decals", "LightFunctions", "Bloom", "AntiAliasing", "Translucency", "Particles", "StaticMeshes")]
elif os.environ.get("US_DIAG"):  # find out where the stray text in the shadows comes from: the cutaway with one feature off at a time
    _cut = SHOTS[2][1:6]
    SHOTS = [("diag_base", *_cut, {})] + [(f"diag_{n}", *_cut, ex) for n, ex in (
        ("sun_other_side", {"sun": (-50, 110)}),
        ("no_vsm", {"cvars": ["r.Shadow.Virtual.Enable 0"]}),
        ("no_lumen", {"cvars": ["r.DynamicGlobalIlluminationMethod 0", "r.ReflectionMethod 0"]}),
        ("no_nanite", {"cvars": ["r.Nanite 0"]}),
        ("no_furniture", {"hide": ["furniture", "modern_wooden", "sofa", "metal_office", "vintage", "wooden_display"]}),
        ("no_trees", {"hide": ["foliage", "bark", "grass"]}),
    )]

st = {"phase": "warmup", "t0": time.time(), "tw": None, "i": 0, "n": 0, "comp": None, "rt": None, "roofs": [], "all": [], "hidden": [], "sun": None}


def set_exposure(comp, ev):
    """one fixed exposure (EV100) for every picture: the automatic one follows the content of the picture before and turned three views of the same house into a bright,
    a dark and a black one. Nothing is brightened per shot; the sun is the engine's default 10 lux."""
    pp = comp.get_editor_property("post_process_settings")
    for key in ("auto_exposure_min_brightness", "auto_exposure_max_brightness"):  # min = max: the adaptation has nothing to adapt (with the extended luminance range these are EV100)
        pp.set_editor_property("override_" + key, True)
        pp.set_editor_property(key, ev)
    comp.set_editor_property("post_process_settings", pp)


def setup():
    global eas, ues
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    ues = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(LEVEL)
    world = ues.get_editor_world()
    st["rt"] = unreal.RenderingLibrary.create_render_target2d(world, W, H, unreal.TextureRenderTargetFormat.RTF_RGBA8)
    cap = eas.spawn_actor_from_class(unreal.SceneCapture2D, unreal.Vector(0, 0, 0))
    cap.set_actor_label("ShotCapture")
    comp = cap.get_component_by_class(unreal.SceneCaptureComponent2D)
    comp.set_editor_property("texture_target", st["rt"])
    comp.set_editor_property("capture_source", unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR)
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("capture_on_movement", False)
    comp.set_editor_property("always_persist_rendering_state", True)  # keeps the temporal state (exposure, sky light, Lumen) between the captures of one picture
    set_exposure(comp, EV)
    st["cap"], st["comp"] = cap, comp
    st["all"] = list(eas.get_all_level_actors())
    st["roofs"] = [a for a in st["all"] if a.get_actor_label().startswith("roof")]
    if os.environ.get("US_DIAG") == "each":  # one picture per piece of the scene that is not house, tree or ground, with just that piece hidden
        _cut = SHOTS[0][1:6]
        own = ("wall", "roof", "floor", "stair", "window", "ground", "bark", "foliage", "grass")
        names = sorted(a.get_actor_label() for a in st["all"] if isinstance(a, unreal.StaticMeshActor) and not a.get_actor_label().startswith(own))
        SHOTS[:] = [("diag_base", *_cut, {})] + [(f"diag_hide{i:02d}_{n}", *_cut, {"hide": [n]}) for i, n in enumerate(names)]
        say(P, len(names), "pieces:", names)
    st["sun"] = next((a for a in st["all"] if a.get_actor_label() == "Sun"), None)
    say(P, "sun actor:", st["sun"])
    say(P, "set up: scene capture, render target", W, "x", H, ", roofs:", len(st["roofs"]), ", actors:", len(eas.get_all_level_actors()))


def begin(i):
    name, pos, tgt, focal, roof_hidden, sun, extra = SHOTS[i]
    st["n"] = 0
    try:
        st["cap"].set_actor_location_and_rotation(pos, look(pos, tgt), False, True)
        st["comp"].set_editor_property("fov_angle", math.degrees(2 * math.atan(SENSOR / (2.0 * focal))))
        for r in st["roofs"]:  # a scene capture renders the game view: actors hidden in game stay out of the picture
            r.set_actor_hidden_in_game(roof_hidden)
        for a in st["hidden"]:
            a.set_actor_hidden_in_game(False)
        st["hidden"] = [a for a in st["all"] if a.get_actor_label().startswith(tuple(extra.get("hide", [])))] if extra.get("hide") else []
        for a in st["hidden"]:
            a.set_actor_hidden_in_game(True)
        set_exposure(st["comp"], extra.get("ev", EV))
        sun = extra.get("sun", sun)
        if st["sun"] is not None:  # the sun stands behind the camera, so the sides you see are lit
            st["sun"].set_actor_rotation(unreal.Rotator(0, sun[0], sun[1]), False)
        for cv in CVARS + extra.get("cvars", []):
            unreal.SystemLibrary.execute_console_command(ues.get_editor_world(), cv)
        flags = [unreal.EngineShowFlagsSetting(show_flag_name=f, enabled=False) for f in extra.get("flags_off", [])]
        st["comp"].set_editor_property("show_flag_settings", flags)
    except Exception as e:  # noqa: BLE001
        say(P, "problem placing", name, ":", e)
    say(P, "camera for", name, "at", pos, "focal", focal, "sun", sun, "roof hidden" if roof_hidden else "", extra or "")


def finish(i):
    name = SHOTS[i][0]
    unreal.RenderingLibrary.export_render_target(ues.get_editor_world(), st["rt"], OUT, f"unreal_{name}.png")
    say(P, "exported", name, "->", OUT)


def tick(dt):
    now = time.time()
    if st["phase"] == "warmup":
        if st["comp"] is None and now - st["t0"] > 20:
            setup(); st["tw"] = now
        elif st["comp"] is not None and now - st["tw"] > WARMUP:
            st["phase"] = "shoot"; begin(0)
        return
    if st["phase"] == "shoot":
        st["comp"].capture_scene()
        st["n"] += 1
        if st["n"] >= CAPTURES:
            finish(st["i"])
            st["i"] += 1
            if st["i"] >= len(SHOTS):
                st["phase"], st["tq"] = "quit", now
            else:
                begin(st["i"])
        return
    if st["phase"] == "quit" and now - st["tq"] > 5:
        say(P, "done")
        unreal.SystemLibrary.execute_console_command(ues.get_editor_world(), "QUIT_EDITOR")
        st["phase"] = "gone"


handle = unreal.register_slate_post_tick_callback(tick)
say(P, "waiting", WARMUP, "s after the setup, then", len(SHOTS), "cameras")
