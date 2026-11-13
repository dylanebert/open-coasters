"""One-time independent Blender import/construction boundary spike.
No app reader/policy imported. Run: blender --background --python assets/assembly/check-native.py
"""
from pathlib import Path
import math
import os
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
delivery = Path(os.environ.get('ASSEMBLY_DELIVERY', str(root / 'demo/public/assets')))
bpy.ops.wm.open_mainfile(filepath=str(Path(__file__).with_name('assembly.blend')))
curves = [o for o in bpy.context.scene.objects if o.type == 'CURVE']
assert len(curves) == 1
source = curves[0]
assert source.location.length == 0 and tuple(source.scale) == (1,1,1)
assert source.data.bevel_depth == 0 and source.data.extrude == 0
spline = source.data.splines[0]
assert spline.type == 'POLY' and spline.use_cyclic_u and len(spline.points) == 16
for i, p in enumerate(spline.points):
    expected = Vector((.06*math.cos(i*math.pi/8),0,.06*math.sin(i*math.pi/8)))
    assert (p.co.xyz-expected).length < 1e-7
assert len([o for o in bpy.context.scene.objects if o.type == 'MESH']) == 6
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(delivery / 'assembly-section.gltf'))
o = bpy.context.selected_objects[0]
assert o.type == 'MESH' and len(o.data.vertices) == 16 and len(o.data.edges) == 16 and len(o.data.polygons) == 0
# Physical glTF XY is Blender XZ, +Z normal becomes Blender -Y.
for i, v in enumerate(o.data.vertices):
    expected = Vector((.06*math.cos(i*math.pi/8), 0, .06*math.sin(i*math.pi/8)))
    assert (o.matrix_world @ v.co - expected).length < 1e-7
assert {tuple(sorted(e.vertices)) for e in o.data.edges} == {tuple(sorted((i,(i+1)%16))) for i in range(16)}
# Construct straight rails independently from imported geometry/connectivity,
# no artificial source extrusion, decoder sharing, source resize or recentering.
vertices, faces = [], []
for x in [-.7,.7]:
    start = len(vertices)
    for y in [6,-6]:
        vertices += [tuple(o.matrix_world @ v.co + Vector((x,y,1.5))) for v in o.data.vertices]
    for e in o.data.edges:
        a,b = e.vertices
        faces.append((start+a,start+b,start+b+16,start+a+16))
    faces.extend([tuple(start+i for i in reversed(range(16))),tuple(start+16+i for i in range(16))])
mesh = bpy.data.meshes.new('Independent straight construction')
mesh.from_pydata(vertices, [], faces)
assert len(mesh.polygons) == 36
for axis, bounds in enumerate([(-.76,.76),(-6,6),(1.44,1.56)]):
    values = [p[axis] for p in vertices]
    assert abs(min(values)-bounds[0]) < 1e-7 and abs(max(values)-bounds[1]) < 1e-7
bpy.context.collection.objects.link(bpy.data.objects.new(mesh.name, mesh))
bpy.data.objects.remove(o, do_unlink=True)

for name, bounds, color, metal, rough in [
    ('assembly-tie-bar', [(-.95,.95),(-.18,-.06),(-.09,.09)], (.035,.32,.48,1), .65,.3),
    ('assembly-tie-fork', [(-.95,.95),(-.18,-.10),(-.13,.13)], (.035,.32,.48,1), .65,.3),
    ('assembly-fitting', [(-.095,.21),(-.13,.095),(0,.20)], (.8,.24,.035,1), .55,.28),
]:
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=str(delivery / (name+'.gltf')))
    objects = list(bpy.context.selected_objects)
    points = [o.matrix_world @ v.co for o in objects if o.type == 'MESH' for v in o.data.vertices]
    # Convert imported native Blender points back to metric glTF basis.
    points = [(p.x,p.z,-p.y) for p in points]
    for axis, (low,high) in enumerate(bounds):
        assert abs(min(p[axis] for p in points)-low) < 1e-7, (name,axis,'low')
        assert abs(max(p[axis] for p in points)-high) < 1e-7, (name,axis,'high')
    for o in objects:
        if o.type != 'MESH': continue
        bsdf = o.data.materials[0].node_tree.nodes.get('Principled BSDF')
        assert max(abs(a-b) for a,b in zip(bsdf.inputs['Base Color'].default_value,color)) < 1e-6
        assert abs(bsdf.inputs['Metallic'].default_value-metal) < 1e-6
        assert abs(bsdf.inputs['Roughness'].default_value-rough) < 1e-6
print('PASS: independent native line import, straight construction, static dimensions/origin/materials', bpy.app.version_string)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/assembly-independent.blend')
