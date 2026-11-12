"""Native Blender import vs archived OBJ directed triangles and corner normals.
No adoption or rebuild helpers. blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/check-import.py
"""
from pathlib import Path
import math
import sys
import bpy
FOLDER=Path(__file__).resolve().parent
ROOT=FOLDER.parents[1]
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else None
for name in ('ModernRail','ModernSpine_1','ModernSpine_2','ModernTie_Med','ModernTie_Dense'):
    vertices=[];normals=[];uv=[];faces=[]
    for line in (FOLDER/(name+'.obj')).read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':vertices.append(tuple(map(float,a[1:])))
        if a[0]=='vt':uv.append(tuple(map(float,a[1:3])))
        if a[0]=='vn':
            n=tuple(map(float,a[1:]));l=math.sqrt(sum(v*v for v in n));normals.append(tuple(v/l for v in n))
        if a[0]=='f':faces.append([tuple(int(x)-1 for x in c.split('/')) for c in a[1:]])
    expected={}
    def canonical(points,ns):
        rotations=[points[i:]+points[:i] for i in range(3)]
        i=min(range(3),key=lambda i:rotations[i])
        return tuple(rotations[i]),ns[i:]+ns[:i]
    for face in faces:
        key,ns=canonical([vertices[c[0]] for c in face],[normals[c[2]] for c in face])
        expected.setdefault(key,[]).append(ns)
    # Inspect the editable contribution as well: source UVs stay there even
    # though the deliberately untextured glTF excludes them.
    bpy.ops.wm.open_mainfile(filepath=str(FOLDER/(name+'.blend')))
    editable=next(obj.data for obj in bpy.context.scene.objects if obj.type=='MESH')
    assert len(editable.vertices)==len(vertices) and len(editable.polygons)==len(faces)
    assert len(editable.uv_layers)==1
    for vertex,source_position in zip(editable.vertices,vertices):
        v=vertex.co
        assert max(abs(x-y) for x,y in zip((v.x,v.z,-v.y),source_position))<1e-6
    for poly,face in zip(editable.polygons,faces):
        assert list(poly.vertices)==[c[0] for c in face]
        for loop,c in zip(poly.loop_indices,face):
            original=uv[c[1]];actual=editable.uv_layers[0].data[loop].uv
            assert max(abs(x-y) for x,y in zip(original,actual))<1e-7
            n=editable.corner_normals[loop].vector
            assert max(abs(x-y) for x,y in zip((n.x,n.z,-n.y),normals[c[2]]))<2.5e-4
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'demo/public/assets'/(name+'.gltf')))
    count=0;max_position=0;max_normal=0
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        mesh=obj.data
        if mode and name=='ModernRail':
            if mode=='unit':
                for v in mesh.vertices:v.co*=100
            elif mode=='origin':
                for v in mesh.vertices:v.co.x+=0.01
            elif mode=='topology':mesh.flip_normals()
            elif mode=='normal':mesh.normals_split_custom_set([(0,0,1)]*len(mesh.loops))
            else:raise ValueError(mode)
            mesh.update()
        mesh.calc_loop_triangles()
        assert len(mesh.uv_layers)==0
        assert len(mesh.materials)==0, 'source has glTF default, not a replacement paint material'
        for tri in mesh.loop_triangles:
            ps=[];ns=[]
            for vertex,loop in zip(tri.vertices,tri.loops):
                v=obj.matrix_world @ mesh.vertices[vertex].co
                p=(v.x,v.z,-v.y);rounded=tuple(round(x,6) for x in p)
                max_position=max(max_position,max(abs(x-y) for x,y in zip(p,rounded)))
                ps.append(rounded)
                n=obj.matrix_world.to_3x3().inverted().transposed() @ mesh.corner_normals[loop].vector
                ns.append((n.x,n.z,-n.y))
            key,ns=canonical(ps,ns)
            assert key in expected and expected[key], 'source position/topology/winding'
            candidates=expected[key]
            errors=[max(abs(x-y) for a,b in zip(ns,source) for x,y in zip(a,b)) for source in candidates]
            best=min(range(len(errors)),key=lambda i:errors[i]);error=errors[best]
            # Import re-encodes custom normals a second time. The medium tie's
            # oblique hard seams have greater storage error than the profiles.
            tolerance=6e-4 if name=='ModernTie_Med' else 5e-5
            assert error<tolerance,(name,'source corner shading',error)
            max_normal=max(max_normal,error);candidates.pop(best);count+=1
    assert count==len(faces) and not any(expected.values())
    assert max_position<1e-6
    print(f'{name}: PASS {count} directed source triangles; max position {max_position:.9g} m; max normalized corner normal component {max_normal:.9g}')
