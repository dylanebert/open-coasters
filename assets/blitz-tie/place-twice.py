"""Standalone Blender adoption example; no engine or project helpers.
blender --background --python assets/blitz-tie/place-twice.py -- /tmp/ties.blend
Optional second argument: path to another static glTF contribution.
"""
from pathlib import Path
import math
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
output = Path(args[0]) if args else Path('/tmp/open-coasters-ties.blend')
asset = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parents[2] / 'demo/public/assets/blitz-tie.gltf'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset.resolve()))
# Keep the imported hierarchy, including its authored origin. Parent its roots
# under a placement empty; do not center, normalize, or apply transforms.
original = list(bpy.context.scene.objects)
roots = [obj for obj in original if obj.parent is None]
for index in range(2):
    placement = bpy.data.objects.new(f'Placement {index + 1}', None)
    bpy.context.collection.objects.link(placement)
    placement.location = (-1.5 if index == 0 else 1.5, 0, 0)
    # glTF +Y is Blender +Z; positive 90 degrees sends +X toward -Z
    # in glTF, hence toward +Y in Blender.
    placement.rotation_euler.z = index * math.pi / 2
    if index == 0:
        for root in roots:
            root.parent = placement
    else:
        copies = {obj: obj.copy() for obj in original}
        for obj, copy in copies.items():
            bpy.context.collection.objects.link(copy)
            copy.parent = copies[obj.parent] if obj.parent in copies else placement
bpy.context.view_layer.update()
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.wm.save_as_mainfile(filepath=str(output.resolve()))
