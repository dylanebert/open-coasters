import { TIMEOUT } from "@dylanebert/shallot/testing";
import { test, expect } from 'bun:test';
import { fixedDistances, framesAt, frame, path, quaternion } from '../../../construction/geometry';
const I = [0,0,0,1];
const near = (a: readonly number[], b: readonly number[]) => a.forEach((x,i) => expect(Math.abs(x-b[i])).toBeLessThanOrEqual(1e-12));
const bits = (x: number) => { const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0,x); return v.getBigUint64(0); };
const from = (x: bigint) => { const v = new DataView(new ArrayBuffer(8)); v.setBigUint64(0,x); return v.getFloat64(0); };
// Exact positive binary rational in units of 2^-1074, independently rounded by integer midpoint comparisons.
function units(b: bigint): bigint { const e = Number(b >> 52n), f = b & ((1n<<52n)-1n); return e === 0 ? f : ((1n<<52n)+f) << BigInt(e-1); }
function rounded(u: bigint): number {
    let lo = 0n, hi = 0x7fefffffffffffffn;
    while (lo < hi) { const mid = (lo+hi+1n)/2n; if (units(mid) <= u) lo = mid; else hi = mid-1n; }
    const up = lo+1n, a = u-units(lo), b = units(up)-u;
    return from(a < b || a === b && lo % 2n === 0n ? lo : up);
}
test('independent integer binary64 oracle: separate multiply/add, not iterative addition or fused arithmetic', () => {
    for (const [spacing, phase, length] of [[.1,.03,2],[.17,.13,3],[1e-200,3e-201,1e-199],[1e200,3e199,1e201]]) {
        const expected: number[] = [];
        for (let k=0;;k++) {
            const product = rounded(units(bits(spacing))*BigInt(k));
            const value = rounded(units(bits(product))+units(bits(phase)));
            if (value >= length) break; expected.push(value);
        }
        expect(fixedDistances(length,spacing,phase,[{start:0,end:length}],[])).toEqual(expected);
        const endpoint = expected.at(-1)!;
        expect(fixedDistances(endpoint,spacing,phase,[{start:0,end:endpoint}],[])).toEqual(expected.slice(0,-1));
        const above = from(bits(endpoint)+1n);
        expect(fixedDistances(above,spacing,phase,[{start:0,end:above}],[])).toEqual(expected);
    }
    const values = fixedDistances(1,.1,.03,[{start:0,end:1}],[]);
    let iterative = .03; const wrong: number[] = []; for (let k=0;k<values.length;k++) { wrong.push(iterative); iterative += .1; }
    expect(values).not.toEqual(wrong);
}, TIMEOUT.cheap);

test('quaternion boundary norm tolerance, WXYZ canonical sign and immutable copies', () => {
    for (const q of [[0,0,0,-1-8e-13],[-1-8e-13,0,0,0],[0,-1-8e-13,0,0],[0,0,-1-8e-13,0]]) {
        const before = [...q], result = quaternion(q);
        expect(q).toEqual(before); expect(Math.hypot(...result)).toBe(1);
        expect([result[3],result[0],result[1],result[2]].find(x=>x!==0)).toBe(1);
    }
    for (const scale of [1+1.1e-12,1-1.1e-12,0,1e-300,1e300,Infinity,NaN]) expect(()=>frame({translation:[0,0,0],rotation:[0,0,0,scale]})).toThrow();
    const q = [0,0,-1,0], source = {distances:[0,1],positions:[[0,0,0],[0,0,1]],rotations:[q,q]};
    const out = framesAt(path(source),[0,1]); expect(out[0].rotation).toEqual([0,0,1,0]); expect(q).toEqual([0,0,-1,0]); expect(Object.isFrozen(out[0].rotation)).toBe(true);
}, TIMEOUT.cheap);

test('exact 180-degree tie retains canonical second representative; SLERP differs from nlerp', () => {
    const p = (rotations: number[][]) => path({distances:[0,4],positions:[[0,0,0],[0,0,4]],rotations});
    near(framesAt(p([I,[0,-1,0,0]]),[1])[0].rotation,[0,Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)]);
    // Dot zero with nonidentity first rotation: choice of second sign is physically observable.
    near(framesAt(p([[-1,0,0,0],[0,-1,0,0]]),[1])[0].rotation,[Math.cos(Math.PI/8),Math.sin(Math.PI/8),0,0]);
    const got = framesAt(p([I,[0,Math.sin(Math.PI/3),0,Math.cos(Math.PI/3)]]),[1])[0].rotation;
    near(got,[0,Math.sin(Math.PI/12),0,Math.cos(Math.PI/12)]);
    const nlerp = [.25*Math.sin(Math.PI/3),.75+.25*Math.cos(Math.PI/3)];
    expect(Math.abs(got[1]-nlerp[0]/Math.hypot(...nlerp))).toBeGreaterThan(.01);
    for (const angle of [1e-9,1e-6,Math.PI-1e-9]) {
        const b = [0,Math.sin(angle/2),0,Math.cos(angle/2)];
        near(framesAt(p([I,b]),[1])[0].rotation,[0,Math.sin(angle/8),0,Math.cos(angle/8)]);
        near(framesAt(p([I,b.map(x=>-x)]),[1])[0].rotation,[0,Math.sin(angle/8),0,Math.cos(angle/8)]);
    }
    // Near antipodal source representatives canonicalize before interpolation.
    near(framesAt(p([[0,0,0,-1],[0,-1e-6,0,-Math.sqrt(1-1e-12)]]),[1])[0].rotation,[0,Math.sin(Math.asin(1e-6)/4),0,Math.cos(Math.asin(1e-6)/4)]);
}, TIMEOUT.cheap);


test('small-angle limit across nonidentity starts, independent axes and interpolation fractions', () => {
    // Closed quaternion product q(start X) * q(delta axis), not geometry helpers.
    for (const start of [.4, 1.7, 2.8]) for (const axis of [[1,0,0],[0,1,0],[0,0,1],[1/3,2/3,2/3]]) {
        const a = Math.sin(start/2), w = Math.cos(start/2);
        const analytic = (angle: number) => {
            const [x,y,z] = axis.map(v=>v*Math.sin(angle/2)), c=Math.cos(angle/2);
            return [a*c+w*x,w*y-a*z,w*z+a*y,w*c-a*x];
        };
        for (const delta of [1e-9,1e-8,1e-6]) for (const t of [.1,.25,.7,.95]) {
            const p=path({distances:[0,1],positions:[[1,2,3],[3,4,5]],rotations:[[a,0,0,w],analytic(delta)]});
            near(framesAt(p,[t])[0].rotation,analytic(t*delta));
            near(framesAt(p,[t])[0].translation,[1+2*t,2+2*t,3+2*t]);
        }
    }
}, TIMEOUT.cheap);
