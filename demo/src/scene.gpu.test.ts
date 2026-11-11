import { expect, test } from 'bun:test';
import { MeshInstance } from '@dylanebert/shallot';
import { Grid } from '@dylanebert/shallot-grid';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { Scene, scene } from './scene';
function different(a: Uint8ClampedArray, b: Uint8ClampedArray) {
    let n = 0;
    for (let i=0;i<a.length;i+=4) if (Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])))>8) n++;
    return n;
}
test('Dawn: object and grid independently contribute visible pixels', async () => {
    const app = await openGpuApp({ plugins: [scene] });
    try {
        console.info('Dawn adapter', app.world.gpu.adapter);
        const w = app.world, s = w.resource(Scene);
        attachTexture(w,s.camera,{width:384,height:288});
        const frame = async () => { w.step(0); const image = await captureTexture(w,s.camera); await w.frameFence; return image.rgba; };
        const composed = await frame();
        w.remove(s.object,MeshInstance);
        const grid = await frame();
        expect(different(composed,grid)).toBeGreaterThan(200);
        w.remove(s.grid,Grid);
        const clear = await frame();
        expect(different(grid,clear)).toBeGreaterThan(200);
    } finally { app.dispose(); }
}, TIMEOUT.gpu);
