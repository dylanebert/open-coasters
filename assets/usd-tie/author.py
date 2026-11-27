"""Author the metric Blender source and export native USDA; see PROVENANCE.md."""
import math
import sys

import bpy

path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

tie = bpy.data.objects.new('Tie', None)
scene.collection.objects.link(tie)
tie.location = .30, -.20, .05
tie.rotation_euler.z = math.pi / 2

# Taper the bar at one end and put its base above the mesh object's origin.
base = [(2, -8), (122, -8), (112, 12), (2, 12)]
points = [(x / 100, y / 100, z / 100) for z in (3, 13) for x, y in base]
faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
for i in range(4):
    j = (i + 1) % 4
    faces.append((i, j, j + 4, i + 4))
mesh = bpy.data.meshes.new('TieMesh')
mesh.from_pydata(points, [], faces)
bar = bpy.data.objects.new('Bar', mesh)
scene.collection.objects.link(bar)
bar.parent = tie
bar.location = .06, .09, .04
bar.rotation_euler.z = -math.pi / 2

steel = bpy.data.materials.new('TieSteel')
bsdf = steel.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (.125, .25, .5, 1)
bsdf.inputs['Metallic'].default_value = .75
bsdf.inputs['Roughness'].default_value = .375
mesh.materials.append(steel)

assert bpy.ops.wm.usd_export(
    filepath=path,
    root_prim_path='',  # Keep the authored Tie as the top-level defaultPrim.
    convert_scene_units='CENTIMETERS',
    convert_orientation=False,
    merge_parent_xform=True,
    triangulate_meshes=False,
    export_materials=True,
    generate_preview_surface=True,
    author_blender_name=False,
    export_custom_properties=False,
    export_normals=False,
) == {'FINISHED'}
