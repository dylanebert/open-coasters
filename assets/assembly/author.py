"""Original MIT assets. Run from repository root with Blender --background --python.
Readable native authoring recipe; no consumer construction or placement policy.
"""
from pathlib import Path
import math
import bpy

root = Path(__file__).resolve().parents[2]
out = root / 'demo/public/assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1

# Blender XZ maps physically to glTF XY. A cyclic sampled curve, not a bore or wall.
curve = bpy.data.curves.new('Circular section', 'CURVE')
curve.dimensions = '3D'
spline = curve.splines.new('POLY')
spline.points.add(15)
for i, p in enumerate(spline.points):
    a = 2 * math.pi * i / 16
    p.co = (.06 * math.cos(a), 0, .06 * math.sin(a), 1)
spline.use_cyclic_u = True
obj = bpy.data.objects.new('Circular section', curve)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
source = obj.copy()
source.data = curve.copy()
# Explicit evaluated interchange: glTF exporter does not preserve Curve editing data.
bpy.ops.object.convert(target='MESH')
bpy.ops.export_scene.gltf(filepath=str(out / 'assembly-section.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_yup=True, use_mesh_edges=True, export_normals=False, export_texcoords=False, export_materials='NONE', export_animations=False)
bpy.data.objects.remove(obj, do_unlink=True)

def material(name, color, metal, rough):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    return m

blue = material('Blue steel', (.035, .32, .48), .65, .3)
gold = material('Warm fitting', (.8, .24, .035), .55, .28)

def box(name, center, size, mat):
    # Recipe coordinates already in glTF's X right / Y up / Z front frame.
    x, y, z = center
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    return o

for name, pieces in [
    ('assembly-tie-bar', [((0, -.12, 0), (1.9, .12, .18))]),
    ('assembly-tie-fork', [((0, -.14, -.09), (1.9, .08, .08)), ((0, -.14, .09), (1.9, .08, .08)), ((0, -.14, 0), (.22, .08, .26))]),
    ('assembly-fitting', [((0, 0, .04), (.19, .19, .08)), ((.13, -.09, .10), (.16, .08, .20))]),
]:
    bpy.ops.object.select_all(action='DESELECT')
    objects = [box(name, p, s, gold if name.endswith('fitting') else blue) for p, s in pieces]
    for o in objects: o.select_set(True)
    # Preserve origin at the declared frame, including the intentionally offset fitting.
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.export_scene.gltf(filepath=str(out / (name + '.gltf')), export_format='GLTF_SEPARATE', use_selection=True, export_yup=True, export_animations=False, export_texcoords=False)
    for o in objects: o.hide_set(True)
# Save editable meshes alongside the retained cyclic curve; delivery remains separate.
bpy.context.collection.objects.link(source)
for o in bpy.context.scene.objects: o.hide_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('assembly.blend')))
print('Assembly native author/export complete', bpy.app.version_string)
