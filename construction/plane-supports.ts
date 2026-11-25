import { mapList } from './list';
import { frame, instance, number, type Frame } from './geometry';
import type { Content } from './native';
import { requireDiagnosticPost } from './support-native';

export type Plane = { readonly point: readonly number[]; readonly normal: readonly number[] };

/** Bases for upright rigid 1.5 m posts on a horizontal +Y plane. */
export function supportPoses(attachments: readonly Frame[], terrain: Plane): readonly Frame[] {
    if (!terrain || Object.keys(terrain).sort().join(',') !== 'normal,point') throw Error('plane requires point and normal');
    for (const v of [terrain.point, terrain.normal]) {
        if (!Array.isArray(v) || v.length !== 3) throw Error('plane requires three components');
        for (let i = 0; i < 3; i++) number(Object.hasOwn(v, i) ? v[i] : undefined);
    }
    const normal = terrain.normal;
    if (Math.abs(Math.hypot(normal[0],normal[1],normal[2])-1) > 1e-12) throw Error('unit plane normal required');
    if (normal[0] !== 0 || normal[1] !== 1 || normal[2] !== 0) throw Error('diagnostic support requires upright horizontal plane');
    return Object.freeze(mapList(attachments, 'attachments', value => {
        const a = frame(value);
        if (a.rotation.some((x,i)=>x !== [0,0,0,1][i]) || a.translation[1]-terrain.point[1] !== 1.5) throw Error('incompatible rigid post height/orientation');
        return frame({translation:[a.translation[0],terrain.point[1],a.translation[2]],rotation:[0,0,0,1]});
    }));
}

export function planeSupports(attachments: readonly Frame[], terrain: Plane, post: Content) {
    const poses = supportPoses(attachments, terrain);
    requireDiagnosticPost(post);
    return instance(post, poses);
}
