import { contentValue, type Content } from './native';
/** Diagnostic selected native post only: an axis-aligned 0.1 × 1.5 × 0.1 m
 * box, identity authored nodes, nonindexed triangles. Not a general post classifier.
 * Inspect actual selected POSITION bytes, never an asset ID or accessor min/max.
 */
export function requireDiagnosticPost(value: Content): void {
    const { snapshot: s } = contentValue(value), d = s.document;
    const points: number[][] = [];
    const visit = (i: number) => {
        const n = d.nodes[i];
        if (n.matrix || n.translation?.some((x: number) => x !== 0) || n.rotation?.some((x: number, i: number) => x !== [0,0,0,1][i]) || n.scale?.some((x: number) => x !== 1)) throw Error('diagnostic post requires identity authored transforms');
        if (n.mesh !== undefined) for (const p of d.meshes[n.mesh].primitives) {
            if (p.indices !== undefined) throw Error('diagnostic post requires nonindexed box triangles');
            const a = d.accessors[p.attributes.POSITION], v = d.bufferViews[a.bufferView];
            const data = new DataView(Uint8Array.from(s.buffers[v.buffer]).buffer);
            for (let j = 0; j < a.count; j++) points.push([0,1,2].map(c => data.getFloat32((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + j * (v.byteStride ?? 12) + c * 4, true)));
        }
        (n.children ?? []).forEach(visit);
    };
    d.scenes[d.scene].nodes.forEach(visit);
    const half = Math.fround(.05);
    const corners = new Set<string>(), faces = new Map<string, number[][][]>();
    if (points.length !== 36) throw Error('diagnostic post requires twelve box triangles');
    for (const p of points) {
        if (![-half,half].includes(p[0]) || ![0,1.5].includes(p[1]) || ![-half,half].includes(p[2])) throw Error('incompatible diagnostic post dimensions');
        corners.add(p.join(','));
    }
    for (let i = 0; i < points.length; i += 3) {
        const t = points.slice(i,i+3);
        const axis = [0,1,2].find(c => t.every(p => p[c] === t[0][c]));
        if (axis === undefined || new Set(t.map(p=>p.join(','))).size !== 3) throw Error('diagnostic post requires box faces');
        const key = `${axis}:${t[0][axis]}`; faces.set(key,[...(faces.get(key) ?? []),t]);
    }
    if (corners.size !== 8 || faces.size !== 6 || [...faces.values()].some(ts => {
        if (ts.length !== 2 || new Set(ts.flat().map(p=>p.join(','))).size !== 4) return true;
        const shared = ts[0].filter(p=>ts[1].some(q=>q.every((x,i)=>x===p[i])));
        return shared.length !== 2 || shared[0].filter((x,i)=>x!==shared[1][i]).length !== 2;
    })) throw Error('diagnostic post requires complete box faces');
}
