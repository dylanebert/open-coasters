# Optional independent import spike, not a pre-land dependency.
# blender --background --python assets/wheel-carrier/check-import.py
# Expected measurements are independent of export.py and the Shallot decoder.
from pathlib import Path
from math import pi
import bpy
from mathutils import Matrix, Vector

fixture = Path(__file__).resolve().parents[2] / 'demo/public/assets/wheel-carrier.gltf'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(fixture))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']


def xyz(v):
    return (v.x, v.z, -v.y)


def close(actual, expected):
    assert all(abs(a - b) < 1e-5 for a, b in zip(actual, expected)), (actual, expected)


def bounds(placement):
    points = [xyz(placement @ o.matrix_world @ v.co)
              for o in meshes for v in o.data.vertices]
    return (tuple(min(p[a] for p in points) for a in range(3)),
            tuple(max(p[a] for p in points) for a in range(3)))


close(bounds(Matrix.Identity(4))[0], (-.70, .30, -.60))
close(bounds(Matrix.Identity(4))[1], (1.20, .90, .70))
a = Matrix.Translation(Vector((-1.5, 0, 0)))
b = Matrix.Translation(Vector((1.5, 0, 0))) @ Matrix.Rotation(pi / 2, 4, 'Z')
close(bounds(a)[0], (-2.20, .30, -.60))
close(bounds(a)[1], (-.30, .90, .70))
close(bounds(b)[0], (.90, .30, -1.20))
close(bounds(b)[1], (2.20, .90, .70))
nose = next(o for o in meshes if o.name == 'Positive Z nose')
close(xyz(nose.matrix_world.translation), (.25, .60, .45))
close(xyz(a @ nose.matrix_world.translation), (-1.25, .60, .45))
close(xyz(b @ nose.matrix_world.translation), (1.95, .60, -.25))
for wheel in [o for o in meshes if o.name.startswith('Wheel')]:
    points = [xyz(wheel.matrix_world @ v.co) for v in wheel.data.vertices]
    close(tuple(max(p[a] for p in points) - min(p[a] for p in points)
                for a in range(3)), (.20, .60, .60))
print('INDEPENDENT BLENDER IMPORT PASS: metric bounds, wheel diameter/thickness, +Z nose, both placements')
