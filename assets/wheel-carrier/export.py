# Export the sole editable geometry source; never rebuild or save over it.
# Run from repository root: blender --background --python assets/wheel-carrier/export.py
from pathlib import Path
import bpy

folder = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(folder / 'wheel-carrier.blend'))
delivery = folder.parent.parent / 'demo/public/assets'
delivery.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(delivery / 'wheel-carrier.gltf'),
    export_format='GLTF_SEPARATE',
    export_yup=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)
