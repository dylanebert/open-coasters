"""Headless editable source and untextured derived exports; run with Blender -t 2."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
FOLDER = Path(__file__).resolve().parent
NAMES = ['ModernRail', 'ModernSpine_1', 'ModernSpine_2', 'ModernTie_Med', 'ModernTie_Dense']

def rebuild(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    positions, normals, uv, faces = [], [], [], []
    for line in (FOLDER / (name + '.obj')).read_text().splitlines():
        a = line.split()
        if not a: continue
        if a[0] == 'v':
            x,y,z = map(float,a[1:]); positions.append((x,-z,y))
        elif a[0] == 'vn':
            x,y,z = map(float,a[1:]); normals.append(Vector((x,-z,y)).normalized())
        elif a[0] == 'vt': uv.append(tuple(map(float,a[1:3])))
        elif a[0] == 'f': faces.append([tuple(int(i)-1 for i in corner.split('/')) for corner in a[1:]])
        elif a[0] in ('mtllib','usemtl'): raise ValueError('Unexpected source material')
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions, [], [[c[0] for c in face] for face in faces]); mesh.update()
    for poly in mesh.polygons: poly.use_smooth = True
    mesh.normals_split_custom_set([normals[c[2]] for face in faces for c in face])
    layer = mesh.uv_layers.new(name='Archived source UV (excluded from untextured export)')
    for loop, corner in zip(layer.data, [c for f in faces for c in f]): loop.uv = uv[corner[1]]
    obj = bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    bpy.context.scene.unit_settings.system='METRIC'
    for notice in ('LICENSE.md','ATTRIBUTION.md'):
        bpy.data.texts.new(notice).write((FOLDER / notice).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(FOLDER / (name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'demo/public/assets'/(name+'.gltf')), export_format='GLTF_SEPARATE',export_yup=True,export_texcoords=False,export_normals=True,export_animations=False,export_cameras=False,export_lights=False,export_copyright=(FOLDER/'LICENSE.md').read_text()+'\n'+(FOLDER/'ATTRIBUTION.md').read_text())

if __name__ == '__main__':
    for name in NAMES: rebuild(name)
