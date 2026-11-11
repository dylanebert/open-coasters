"""Rebuild from archived OBJ, preserving its numeric XYZ in glTF meters.
blender --background --python assets/blitz-tie/rebuild.py
"""
from pathlib import Path
import bpy

folder = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
# OBJ coordinates are retained, not interpreted through Unity. Blender's
# Z-up representation of glTF (x,y,z) is (x,-z,y), a proper rotation.
vertices, faces = [], []
for line in (folder / 'ModernTie_Light.obj').read_text().splitlines():
    fields = line.split()
    if fields[:1] == ['v']:
        x, y, z = map(float, fields[1:])
        vertices.append((x, -z, y))
    elif fields[:1] == ['f']:
        faces.append([int(v.split('/')[0]) - 1 for v in fields[1:]])
mesh = bpy.data.meshes.new('Archived tie geometry')
mesh.from_pydata(vertices, [], faces)
mesh.update()
obj = bpy.data.objects.new('ModernTie_Light', mesh)
bpy.context.collection.objects.link(obj)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
for notice in ('LICENSE.md', 'ATTRIBUTION.md'):
    bpy.data.texts.new(notice).write((folder / notice).read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'blitz-tie.blend'))
bpy.ops.export_scene.gltf(
    filepath=str(folder.parents[1] / 'demo/public/assets/blitz-tie.gltf'),
    export_format='GLTF_SEPARATE', export_yup=True,
    export_copyright=(folder / 'LICENSE.md').read_text() + '\n' + (folder / 'ATTRIBUTION.md').read_text(),
    export_animations=False, export_cameras=False, export_lights=False,
)
