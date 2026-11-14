import { immutable, registry, type Primitive, type TypeDefinition } from './kernel';
import { frame, ids, instance, list, nominal, number, standardOperations, standardTypes, type Frame } from './geometry';
import { type Content } from './native';
import { requireDiagnosticPost } from './support-native';
export const planeId = 'example.plane@1';
export type Plane = { readonly point: readonly number[]; readonly normal: readonly number[] };
export function plane(value: any): Plane {
    if (!value || Object.keys(value).sort().join(',') !== 'normal,point') throw Error('plane requires point and normal');
    for (const key of ['point','normal']) {
        if (!Array.isArray(value[key]) || value[key].length !== 3) throw Error('plane requires three components');
        value[key].forEach(number);
    }
    if (Math.abs(Math.hypot(...value.normal)-1) > 1e-12) throw Error('unit plane normal required');
    return immutable({ point: [...value.point], normal: [...value.normal] });
}
export const planeType: TypeDefinition = { id: planeId, validate: plane, decode: plane };
/** Separately installed, intentionally bounded upright rigid 1.5 m box witness.
 * Only horizontal +Y planes and identity attachment rotations; no scale/solver.
 */
export const planeSupports: Primitive = immutable({
    operation: 'example.planeSupports@1',
    inputs: [{name:'attachments',type:list(nominal(ids.frame))},{name:'terrain',type:nominal(planeId)},{name:'post',type:nominal(ids.content)}],
    outputs: [{name:'construction',type:nominal(ids.construction)}],
    evaluate(v) {
        const terrain = plane(v.terrain), post = v.post as Content;
        requireDiagnosticPost(post);
        if (terrain.normal.some((x,i)=>x !== [0,1,0][i])) throw Error('diagnostic support requires upright horizontal plane');
        const frames = (v.attachments as readonly Frame[]).map(a => {
            if (a.rotation.some((x,i)=>x !== [0,0,0,1][i]) || a.translation[1]-terrain.point[1] !== 1.5) throw Error('incompatible rigid post height/orientation');
            return frame({translation:[a.translation[0],terrain.point[1],a.translation[2]],rotation:[0,0,0,1]});
        });
        return { construction: instance(post,frames) };
    },
});
export const supportRegistry = () => registry([...standardTypes,planeType],[...standardOperations,planeSupports]);
