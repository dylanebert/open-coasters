import { expect, test } from "bun:test";
import { Materials, Meshes } from "@dylanebert/shallot";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { initialConfiguration } from "./configuration";
import { liveScene } from "./live";
import { Scene } from "./scene";

for (const configuration of ["straight","curve","loop"] as const)
  test(`Dawn: ${configuration} yoke assembly has three visible independent paint channels`,async()=>{
    const selection={...initialConfiguration,parameters:{...initialConfiguration.parameters,configuration,fixed:false}};
    const scene=liveScene(selection,name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
    const app=await openGpuApp({plugins:[scene.plugin]});
    try {
      const w=app.world, refs=w.resource(Scene), camera=refs.camera;
      attachTexture(w,camera,{width:384,height:288});
      const capture=async()=>{w.step(0);const result=await captureTexture(w,camera);await w.frameFence;return result.rgba;};
      const baseline=await capture(), entities=refs.instances.map(g=>[...g]);
      const meshes=[...w.resource(Meshes)], materials=w.resource(Materials), add=materials.add.bind(materials);
      let registrations=0;
      materials.add=(...args)=>{registrations++;return add(...args);};
      expect(entities.length).toBe(3);
      for (const part of ["rails","ties","spine"] as const) {
        await scene.update({...selection,paint:{...selection.paint,[part]:"#ff0066"}});
        const painted=await capture();
        let changed=0;
        for (let i=0;i<baseline.length;i+=4)
          if (Math.max(Math.abs(painted[i]-baseline[i]),Math.abs(painted[i+1]-baseline[i+1]),Math.abs(painted[i+2]-baseline[i+2]))>12) changed++;
        expect(changed).toBeGreaterThan(15);
        expect(refs.camera).toBe(camera);
        expect(refs.instances).toEqual(entities);
        expect([...w.resource(Meshes)]).toEqual(meshes);
        expect(registrations).toBe(0);
        await scene.update(selection);
        expect(await capture()).toEqual(baseline);
      }
    } finally {app.dispose();}
  },TIMEOUT.gpu);
