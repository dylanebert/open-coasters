"""Standalone native Blender consumer, NOT the verification oracle.
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/adopt.py -- /tmp/modern.blend /tmp/modern-blender.json
Optional third argument: directory containing the three glTF profiles.
Consumer policy: 192 equal-length intervals, linear position / shortest-path
normalized quaternion interpolation for recording, transported section normals,
open ends. This policy belongs to this example, not the profile binding.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
ROOT = Path(__file__).resolve().parents[2]
NAMES = ['ModernRail','ModernSpine_1','ModernSpine_2']

def extract(path):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = list(bpy.context.selected_objects)
    corners = []
    for obj in objects:
        if obj.type != 'MESH': continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        # Standard importer represents glTF XYZ as Blender (x,-z,y).
        def xyz(v):
            p = obj.matrix_world @ v
            return (p.x,p.z,-p.y)
        points = [xyz(v.co) for v in mesh.vertices]
        low = min(p[2] for p in points); high = max(p[2] for p in points)
        assert high-low > 2e-6
        assert all(min(abs(p[2]-low),abs(p[2]-high)) < 1e-6 for p in points)
        rotation = obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            assert len({round(points[v][2],6) for v in tri.vertices}) == 2
            for j in range(3):
                va,vb = tri.vertices[j],tri.vertices[(j+1)%3]
                a,b = points[va],points[vb]
                if abs(a[2]-low)>1e-6 or abs(b[2]-low)>1e-6: continue
                normals=[]
                for k in (j,(j+1)%3):
                    n=rotation @ mesh.corner_normals[tri.loops[k]].vector
                    normals.append((n.x,n.z,-n.y))
                assert all(abs(n[2])<1e-5 for n in normals)
                corners.append(dict(a=a[:2],b=b[:2],normals=normals,material=tri.material_index))
    assert len(corners) == len({tuple(round(v,6) for v in c['a']) for c in corners})
    for c in corners:
        assert sum(math.dist(c['b'], d['a'])<1e-6 for d in corners)==1
    for obj in objects: bpy.data.objects.remove(obj,do_unlink=True)
    return corners

class Track:
    def __init__(self):
        self.rows=json.loads((ROOT/'demo/src/loop-path.json').read_text())
        self.crown=max(self.rows,key=lambda r:r[2])
    def length(self,kind): return 12 if kind=='straight' else 4*math.pi if kind=='curve' else self.rows[-1][0]
    def frame(self,kind,s):
        if kind=='straight': return (0,1.5,6-s),Vector((1,0,0)),Vector((0,1,0))
        if kind=='curve':
            a=s/8-math.pi/4; b=math.pi/6
            c,d=math.cos(a),math.sin(a)
            up=Vector((-c*math.sin(b),math.cos(b),-d*math.sin(b)))
            travel=Vector((-d,0,c))
            return (8*c-6,1.5,8*d),travel.cross(up),up
        s=max(0,min(self.length(kind),s))
        i=next((i for i in range(len(self.rows)-1) if self.rows[i+1][0]>=s),len(self.rows)-2)
        a,b=self.rows[i:i+2]; t=(s-a[0])/(b[0]-a[0])
        px,py,pz=(x+(y-x)*t for x,y in zip(a[1:4],b[1:4]))
        qa=Quaternion((a[7],*a[4:7])); qb=Quaternion((b[7],*b[4:7]))
        if qa.dot(qb)<0: qb.negate()
        q=Quaternion(tuple(x+(y-x)*t for x,y in zip(qa,qb))).normalized()
        right=q @ Vector((1,0,0)); up=q @ Vector((0,1,0))
        return (self.crown[1]-px,py+1.5,self.crown[3]-pz),Vector((-right.x,right.y,-right.z)),Vector((-up.x,up.y,-up.z))

def construct(edges,kind,track):
    vertices=[]; normals=[]; faces=[]; output=[]
    for edge in edges:
        start=len(vertices)
        for station in range(193):
            p,x,y=track.frame(kind,track.length(kind)*station/192)
            for xy,n in zip((edge['a'],edge['b']),edge['normals']):
                # Round world positions only when storing them in the mesh.
                vx,vy,vz=(o+r*xy[0]+u*xy[1] for o,r,u in zip(p,x,y))
                normal=x*n[0]+y*n[1]
                vertices.append((vx,-vz,vy)); normals.append((normal.x,-normal.z,normal.y))
        for i in range(192):
            a=start+2*i; faces.extend([(a,a+3,a+1),(a,a+2,a+3)])
        output.append(dict(a=edge['a'],b=edge['b'],material=edge['material']))
    mesh=bpy.data.meshes.new(kind); mesh.from_pydata(vertices,[],faces);mesh.update()
    for p in mesh.polygons:p.use_smooth=True
    mesh.normals_split_custom_set([normals[i] for f in faces for i in f])
    obj=bpy.data.objects.new(kind,mesh);bpy.context.collection.objects.link(obj)
    # Report the constructed Blender mesh, not pre-storage input arrays. Blender
    # encodes custom normals; this boundary can introduce additional rounding.
    stored_normals={}
    for loop,normal in zip(mesh.loops,mesh.corner_normals):
        n=normal.vector;value=(n.x,n.z,-n.y)
        if loop.vertex_index in stored_normals:
            assert math.dist(stored_normals[loop.vertex_index],value)<1e-5
        stored_normals[loop.vertex_index]=value
    for i,edge in enumerate(output):
        edge['positions']=[];edge['normals']=[]
        for index in range(i*386,(i+1)*386):
            v=mesh.vertices[index].co
            edge['positions'].append((v.x,v.z,-v.y))
            edge['normals'].append(stored_normals[index])
    return output,[index for poly in mesh.polygons for index in poly.vertices]

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    dest=Path(args[0]) if args else Path('/tmp/modern.blend')
    report=Path(args[1]) if len(args)>1 else dest.with_suffix('.json')
    source=Path(args[2]) if len(args)>2 else ROOT/'demo/public/assets'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    track=Track();result=[]
    for name in NAMES:
        edges=extract(source/(name+'.gltf'))
        for kind in ('straight','curve','loop'):
            output,indices=construct(edges,kind,track)
            bpy.context.collection.objects[-1].name=name+' '+kind
            result.append(dict(name=name,kind=kind,edges=output,indices=indices,materials=[e['material'] for e in edges for _ in range(384)]))
    bpy.ops.wm.save_as_mainfile(filepath=str(dest))
    report.write_text(json.dumps(result))
