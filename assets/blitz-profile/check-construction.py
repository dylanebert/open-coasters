"""Independent source oracle for two consumer artifacts. Uses no bpy, Shallot,
production profile output as expected data, or adoption helpers.
python assets/blitz-profile/check-construction.py /tmp/modern-ts.json /tmp/modern-blender.json
Optional last argument unit/origin/topology/normal deliberately corrupts input.
"""
import json
import math
import sys
from pathlib import Path
FOLDER=Path(__file__).resolve().parent
ROOT=FOLDER.parents[1]
POSITION=3e-6  # Blender single-precision world-space construction, meters.
NORMAL=1e-4  # source normalization + native import and constructed custom-normal storage.

def source(name):
    vs=[];ns=[];faces=[]
    for line in (FOLDER/(name+'.obj')).read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':vs.append(tuple(map(float,a[1:])))
        if a[0]=='vn':
            n=list(map(float,a[1:])); l=math.sqrt(sum(x*x for x in n)); ns.append([x/l for x in n])
        if a[0]=='f':faces.append([[int(x)-1 for x in c.split('/')] for c in a[1:]])
        assert a[0] not in ('mtllib','usemtl'), 'Unexpected material dependency'
    low=min(v[2] for v in vs)
    edges=[]
    for face in faces:
        for i,c in enumerate(face):
            d=face[(i+1)%len(face)]
            if vs[c[0]][2]==low and vs[d[0]][2]==low:
                edges.append((vs[c[0]][:2],vs[d[0]][:2],ns[c[2]],ns[d[2]]))
    assert len(edges)==(32 if name=='ModernRail' else 24)
    return edges

def near(a,b,t):return len(a)==len(b) and all(abs(x-y)<=t for x,y in zip(a,b))
rows=json.loads((ROOT/'demo/src/loop-path.json').read_text())
apex=max(rows,key=lambda r:r[2])[1]

def expected(kind,station,xy,n):
    if kind=='straight':
        return [xy[0],xy[1]+1.5,12*station/192-6],[n[0],n[1],0]
    if kind=='curve':
        angle=-math.pi/4+math.pi/2*station/192
        # Explicit composed bank and yaw matrix, independent of consumer frames.
        c=math.cos(angle);s=math.sin(angle); bank=math.pi/6
        u=xy[0]*math.cos(bank)-xy[1]*math.sin(bank)
        v=xy[0]*math.sin(bank)+xy[1]*math.cos(bank)
        nu=n[0]*math.cos(bank)-n[1]*math.sin(bank)
        nv=n[0]*math.sin(bank)+n[1]*math.cos(bank)
        return [8*c-6+c*u,1.5+v,8*s+s*u],[c*nu,nv,s*nu]
    distance=rows[-1][0]*station/192
    j=0
    while j<len(rows)-2 and rows[j+1][0]<distance:j+=1
    a,b=rows[j:j+2];t=(distance-a[0])/(b[0]-a[0])
    sign=-1 if sum(a[k]*b[k] for k in range(4,8))<0 else 1
    q=[(1-t)*a[k]+t*sign*b[k] for k in range(4,8)]
    norm=math.sqrt(sum(v*v for v in q));x,y,z,w=[v/norm for v in q]
    matrix=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)], [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)], [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    def rotate(v):return [sum(r[k]*v[k] for k in range(3)) for r in matrix]
    # Input section X is reversed with recorded forward; world Y half-turn.
    v=rotate([-xy[0],xy[1],0]);normal=rotate([-n[0],n[1],0])
    p=[(1-t)*a[k]+t*b[k] for k in (1,2,3)]
    return [-p[0]+apex-v[0],p[1]+1.5+v[1],-p[2]-4.3-v[2]],[-normal[0],normal[1],-normal[2]]

def check(path,negative=None):
    report=json.loads(Path(path).read_text())
    assert len(report)==9
    if negative:
        entry=report[0]
        if negative=='unit': entry['edges'][0]['positions'][0]=[v*100 for v in entry['edges'][0]['positions'][0]]
        elif negative=='origin':entry['edges'][0]['positions'][0][0]+=0.01
        elif negative=='topology':entry['indices'][0]=entry['indices'][1]
        elif negative=='normal':entry['edges'][0]['normals'][0]=[0,0,1]
        else: raise ValueError(negative)
    max_position=max_normal=0
    assert {(e['name'],e['kind']) for e in report}=={(n,k) for n in ('ModernRail','ModernSpine_1','ModernSpine_2') for k in ('straight','curve','loop')}
    for entry in report:
        edges=source(entry['name']);actual=entry['edges']; assert len(actual)==len(edges)
        expected_indices=[]
        for i in range(len(edges)):
            for station in range(192):
                a=i*386+2*station;expected_indices.extend([a,a+1,a+3,a,a+3,a+2])
        assert entry['indices']==expected_indices, 'topology/winding'
        assert entry['materials']==[0]*(len(edges)*384), 'default material'
        for a,b,na,nb in edges:
            matches=[e for e in actual if near(e['a'],a,1e-6) and near(e['b'],b,1e-6)]
            assert len(matches)==1,'source edge/semantic origin'
            e=matches[0]; assert e['material']==0
            assert len(e['positions'])==len(e['normals'])==386
            for station in range(193):
                for corner,(xy,n) in enumerate(((a,na),(b,nb))):
                    p,normal=expected(entry['kind'],station,xy,n)
                    got=e['positions'][2*station+corner];gn=e['normals'][2*station+corner]
                    pd=max(abs(x-y) for x,y in zip(p,got));nd=max(abs(x-y) for x,y in zip(normal,gn))
                    max_position=max(max_position,pd);max_normal=max(max_normal,nd)
                    assert pd<=POSITION,(entry['name'],entry['kind'],station,'position',pd)
                    assert nd<=NORMAL,(entry['name'],entry['kind'],station,'normal',nd)
    print(f'{path}: PASS 9 constructions, all 193 stations, max position {max_position:.9g} m; max normal component {max_normal:.9g}')

if __name__=='__main__':
    paths=sys.argv[1:3];negative=sys.argv[3] if len(sys.argv)>3 else None
    for path in paths:check(path,negative)
