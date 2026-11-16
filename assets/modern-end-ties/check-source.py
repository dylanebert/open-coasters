"""Independent stdlib CPU oracle; python assets/modern-end-ties/check-source.py.
Reads archived OBJ and raw glTF accessors, not exporter or decoder helpers.
"""
from pathlib import Path
import copy
import hashlib
import json
import math
import struct
import unittest

FOLDER = Path(__file__).resolve().parent
PUBLIC = FOLDER.parents[1] / 'demo/public/assets'
BLOBS = {'Modern_StartTie': '73caffe94be726cf3dc979f2cecc66d4cd616613',
         'Modern_EndTie': '01ab3a4cbb0ee4e29b0aeaae5f87848e0a1ba359'}


def source(name):
    positions, normals, faces = [], [], []
    for line in (FOLDER / (name + '.obj')).read_text().splitlines():
        a = line.split()
        if not a: continue
        if a[0] == 'v': positions.append(tuple(map(float, a[1:])))
        if a[0] == 'vn':
            n = tuple(map(float, a[1:])); length = math.sqrt(sum(x*x for x in n))
            normals.append(tuple(x/length for x in n))
        if a[0] == 'f':
            corners = [tuple(int(i)-1 for i in c.split('/')) for c in a[1:]]
            assert len(corners) == 3
            faces.append([(positions[c[0]], normals[c[2]]) for c in corners])
        assert a[0] not in ('mtllib', 'usemtl')
    return faces


def delivery(name, doc=None):
    if doc is None: doc = json.loads((PUBLIC / (name + '.gltf')).read_text())
    assert len(doc['nodes']) == 1 and len(doc['meshes']) == 1
    assert doc['nodes'][0] == {'mesh': 0, 'name': name}, 'unaccounted frame transform'
    primitive, = doc['meshes'][0]['primitives']
    assert set(primitive['attributes']) == {'POSITION', 'NORMAL'}
    assert primitive.get('mode', 4) == 4
    assert 'material' not in primitive and not doc.get('materials'), 'default appearance'
    def accessor(index):
        a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
        data = (PUBLIC / doc['buffers'][view['buffer']]['uri']).read_bytes()
        fmt = {5126: 'f', 5123: 'H', 5125: 'I'}[a['componentType']]
        width = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        size = struct.calcsize('<' + fmt*width)
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + fmt*width, data, offset+i*view.get('byteStride', size)) for i in range(a['count'])]
    positions = accessor(primitive['attributes']['POSITION'])
    normals = accessor(primitive['attributes']['NORMAL'])
    indices = [v[0] for v in accessor(primitive['indices'])]
    return [[(positions[i], normals[i]) for i in indices[j:j+3]] for j in range(0, len(indices), 3)]


def compare(expected, actual):
    # Directed cyclic equivalence only: reversal, missing and duplicate triangles fail.
    def key(tri):
        p = [tuple(round(x, 6) for x in c[0]) for c in tri]
        start = min(range(3), key=lambda i: p[i:]+p[:i])
        return tuple(p[start:]+p[:start]), tri[start:]+tri[:start]
    remaining = {}
    for tri in expected:
        k, t = key(tri); remaining.setdefault(k, []).append(t)
    maximum_position = maximum_normal = 0
    for tri in actual:
        k, t = key(tri)
        assert k in remaining and remaining[k], 'origin/unit/directed topology'
        candidates = remaining[k]
        errors = [max(abs(x-y) for a,b in zip(t,c) for x,y in zip(a[1],b[1])) for c in candidates]
        best = min(range(len(errors)), key=errors.__getitem__)
        original = candidates.pop(best)
        pe = max(abs(x-y) for a,b in zip(t,original) for x,y in zip(a[0],b[0]))
        assert pe < 1e-6 and errors[best] < 2.5e-4, 'metric position/corner shading'
        maximum_position = max(maximum_position, pe); maximum_normal = max(maximum_normal, errors[best])
    assert not any(remaining.values()), 'missing triangles'
    return maximum_position, maximum_normal


class SourceEvidence(unittest.TestCase):
    def test_source_and_export(self):
        for name, blob in BLOBS.items():
            data = (FOLDER / (name+'.obj')).read_bytes()
            self.assertEqual(hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest(), blob)
            expected, actual = source(name), delivery(name)
            self.assertEqual(len(expected), 260)
            print(name, 'source/export max position m, normal component:', compare(expected, actual))
            print(name, 'XYZ bounds:', [(min(c[0][a] for t in expected for c in t), max(c[0][a] for t in expected for c in t)) for a in range(3)])
            painted = json.loads((PUBLIC / (name + '.gltf')).read_text())
            painted['materials'] = [{'pbrMetallicRoughness': {'baseColorFactor': [1,0,0,1]}}]
            painted['meshes'][0]['primitives'][0]['material'] = 0
            with self.assertRaises(AssertionError): delivery(name, painted)
            print(name, 'replacement material rejected')
            for mode in ('unit', 'origin', 'topology', 'normal'):
                damaged = copy.deepcopy(actual)
                if mode == 'topology': damaged[0].reverse()
                else:
                    for tri in damaged:
                        for i, (p,n) in enumerate(tri):
                            if mode == 'unit': p = tuple(x*100 for x in p)
                            if mode == 'origin': p = (p[0]+0.01, p[1], p[2])
                            if mode == 'normal': n = (0, 0, 1)
                            tri[i] = (p,n)
                with self.assertRaises(AssertionError, msg=mode): compare(expected, damaged)
                print(name, mode, 'rejected')

if __name__ == '__main__': unittest.main()
