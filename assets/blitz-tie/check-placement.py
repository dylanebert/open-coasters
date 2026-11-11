"""Focused source witness, separate from the usable placement example.
blender --background --python assets/blitz-tie/check-placement.py
Negative controls: append -- origin, -- unit, or -- orientation (must fail).
"""
from pathlib import Path
import runpy
import sys
import bpy

folder = Path(__file__).resolve().parent
mode = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else None
sys.argv = [sys.argv[0]]
runpy.run_path(str(folder / 'place-twice.py'))
if mode:
    placement = bpy.data.objects['Placement 2']
    if mode == 'origin':
        placement.location.x += 0.1
    elif mode == 'unit':
        placement.scale *= 100
    elif mode == 'orientation':
        placement.rotation_euler.z = 0
    else:
        raise ValueError(mode)
bpy.context.view_layer.update()
source = [tuple(map(float, line.split()[1:])) for line in
          (folder / 'ModernTie_Light.obj').read_text().splitlines() if line.startswith('v ')]
# Compare every raw source position, not only symmetric bounds. In particular
# the authored ~1 micrometer +Z offset distinguishes the origin from centering.
for index in range(2):
    parent = bpy.data.objects[f'Placement {index + 1}']
    actual = []
    for obj in parent.children_recursive:
        if obj.type == 'MESH':
            for vertex in obj.data.vertices:
                p = obj.matrix_world @ vertex.co
                actual.append((p.x, p.z, -p.y))  # Blender -> glTF basis
    expected = [(x - 1.5, y, z) if index == 0 else (1.5 + z, y, -x)
                for x, y, z in source]
    def covered(points, candidates):
        return all(any(max(abs(a-b) for a, b in zip(p, q)) < 2e-7
                       for q in candidates) for p in points)
    assert actual and covered(expected, actual) and covered(actual, expected), f'placement {index + 1}: source landmarks changed ({mode})'
print('PASS: all source landmarks, both independent rigid placements')
