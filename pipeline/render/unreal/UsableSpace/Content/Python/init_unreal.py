# Unreal runs this file when the editor starts. It does nothing unless US_SHOTS is set: render_shots.py needs an editor that stays open while the shaders compile and the
# pictures are taken, and -ExecutePythonScript quits the editor as soon as the script returns.
import os
import runpy

if os.environ.get("US_SHOTS"):
    runpy.run_path(os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "render_shots.py")))
