"""One-time native import check, with expectations in Blender's metric Z-up frame."""
import sys
from math import isclose

import bpy
from mathutils import Vector


def near(actual, expected):
    assert all(isclose(a, b, abs_tol=1e-6, rel_tol=0)
               for a, b in zip(actual, expected, strict=True)), (tuple(actual), expected)


def frame(matrix, expected):
    for point, target in zip(((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)),
                             expected, strict=True):
        near(matrix @ Vector(point), target)


path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
# Import the standalone file, not a population mask that excludes its material scope.
assert bpy.ops.wm.usd_import(
    filepath=path, scale=1, apply_unit_conversion_scale=True,
    import_materials=True, import_usd_preview=True, merge_parent_xform=False,
) == {'FINISHED'}
bpy.context.view_layer.update()

tie = scene.objects['Tie']
bar = scene.objects['Bar']
assert tie.type == 'EMPTY' and tie.parent is None and list(tie.children) == [bar]
assert bar.type == 'MESH' and [o for o in scene.objects if o.type == 'MESH'] == [bar]
frame(tie.matrix_local, ((.30, -.20, .05), (.30, .80, .05), (-.70, -.20, .05), (.30, -.20, 1.05)))
frame(bar.matrix_local, ((.06, .09, .04), (.06, -.91, .04), (1.06, .09, .04), (.06, .09, 1.04)))
points = ((.02, -.08, .03), (1.22, -.08, .03), (1.12, .12, .03), (.02, .12, .03),
          (.02, -.08, .13), (1.22, -.08, .13), (1.12, .12, .13), (.02, .12, .13))
for vertex, point in zip(bar.data.vertices, points, strict=True):
    near(vertex.co, point)
near(bar.matrix_world @ bar.data.vertices[0].co, (.23, -.22, .12))
assert [tuple(p.vertices) for p in bar.data.polygons] == [
    (3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
], 'polygon topology or winding'

assert len(bar.material_slots) == 1
material = bar.material_slots[0].material
assert material and material.name == 'TieSteel'
assert all(p.material_index == 0 for p in bar.data.polygons), 'face material assignment'
output = next(n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
shader = output.inputs['Surface'].links[0].from_node
assert shader.type == 'BSDF_PRINCIPLED'
for name, expected in [('Base Color', (.125, .25, .5, 1)), ('Metallic', (.75,)),
                       ('Roughness', (.375,)), ('Alpha', (1,))]:
    socket = shader.inputs[name]
    assert not socket.is_linked, name
    value = socket.default_value
    near((value,) if socket.type == 'VALUE' else value, expected)
print(f'PASS: native hierarchy, metric points, quad winding and TieSteel ({bpy.app.version_string})')
