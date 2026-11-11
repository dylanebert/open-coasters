# Original illustrative geometry, MIT; no imported geometry.
# Run from repository root: blender --background --python assets/wheel-carrier/export.py
from pathlib import Path
import bpy
from math import pi

out = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .6
    return m


steel = material('Carrier blue', (.08, .32, .65))
rubber = material('Wheel dark', (.06, .07, .09))
gold = material('Facing landmark', (.95, .45, .04))
root = bpy.data.objects.new('Authored assembly', None)
bpy.context.collection.objects.link(root)
# Blender Z-up -> glTF Y-up: (x, y, z) -> (x, z, -y).
root.location = (.25, .2, .3)


def cube(name, location, dimensions, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = root
    obj.location = location
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


cube('Carrier', (0, 0, .15), (1.4, .8, .3), steel)
cube('Positive Z nose', (0, -.65, .3), (.2, .5, .2), gold)
for x in [-.85, .85]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.3, depth=.2)
    obj = bpy.context.object
    obj.name = 'Wheel'
    obj.parent = root
    obj.location = (x, 0, .3)
    obj.rotation_euler[1] = pi / 2
    obj.data.materials.append(rubber)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'wheel-carrier.blend'))
delivery = out.parent.parent / 'demo/public/assets'
delivery.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(delivery / 'wheel-carrier.gltf'),
    export_format='GLTF_SEPARATE',
    export_yup=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)
