// Technical parametric material qualification is not an ordinary app example.
// This fixture uses the same public registration/material/entity boundary, while
// liveScene remains responsible for the supported native assembly and its paint.
import { Materials, MeshMaterial, StandardMaterial, Transform, MeshInstance, Meshes, type Plugin, type World } from '@dylanebert/shallot';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { liveScene, type Selection } from '../src/live';
import { generate } from '../src/track';
import { Scene, initializeView } from '../src/scene';
import { linearColor, defaultPaint, type Paint } from '../src/configuration';
import { OrbitPlugin } from '@dylanebert/shallot/extras';
import { GridPlugin } from '@dylanebert/shallot-grid';
import type { MaterialHandle } from '@dylanebert/shallot/standard/rendering';

function parametricScene(initial:Selection) {
  let world:World;
  const handles={} as Record<keyof Paint,MaterialHandle>;
  const plugin:Plugin={name:'parametric-material-fixture',dependencies:[OrbitPlugin,GridPlugin],initialize(w){
    world=w;initializeView(w,initial.parameters);
    const mesh=generate(initial.parameters),refs=w.resource(Scene);
    for(const part of mesh.parts) {
      handles[part.name]=w.resource(Materials).add(StandardMaterial({baseColor:linearColor((initial.paint??defaultPaint)[part.name]),metallic:.4,perceptualRoughness:.35}));
      if(part.index===part.endIndex)continue;
      const handle=w.resource(Meshes).add({name:`Fixture ${part.name}`,vertices:mesh.vertices.subarray(part.vertex*8,part.endVertex*8),indices:mesh.indices.slice(part.index,part.endIndex).map(i=>i-part.vertex)});
      const entity=w.create();w.add(entity,Transform);w.add(entity,MeshInstance,{mesh:handle});w.add(entity,MeshMaterial,handles[part.name]);refs.instances.push([entity]);
    }
  }};
  return {plugin,async update(selection:Selection){
    for(const part of ['rails','ties','spine'] as const)world.resource(Materials).update(handles[part],{baseColor:linearColor((selection.paint??defaultPaint)[part])});
  }};
}

export function paintScene(initial:Selection,url:(name:string)=>URL) {
  if(!initial.parameters.fixed)return parametricScene(initial);
  const native=(s:Selection):Selection=>({...s,parameters:{...s.parameters,fixed:true}});
  const live=liveScene(native(initial),url);
  let world:World;
  const restored=new Map<number,MeshHandle>();
  const fixture=new Map<string,MeshHandle>();
  const plugin:Plugin={name:'parametric-paint-fixture',dependencies:[live.plugin],initialize(w){world=w;}};
  return {plugin,async update(selection:Selection) {
    const registry=world.resource(Meshes),instances=world.storage(MeshInstance);
    for(const [entity,mesh] of restored)if(world.has(entity,MeshInstance)&&registry.has(mesh))instances.mesh.set(entity,mesh);
    restored.clear();
    await live.update(native(selection));
    if(selection.parameters.fixed||selection.isolated)return;
    const mesh=generate(selection.parameters);
    for(const part of mesh.parts) {
      if(part.index===part.endIndex)continue;
      let handle=fixture.get(part.name);
      if(handle===undefined||!registry.has(handle)) {
        handle=registry.add({name:`Fixture ${part.name}`,vertices:mesh.vertices.subarray(part.vertex*8,part.endVertex*8),indices:mesh.indices.slice(part.index,part.endIndex).map(i=>i-part.vertex)});
        fixture.set(part.name,handle);
      }
      for(const entity of world.resource(Scene).instances.flat()) {
        const original=instances.mesh.get(entity) as MeshHandle;
        if(registry.get(original)?.name===`Track ${part.name}`) {restored.set(entity,original);instances.mesh.set(entity,handle);}
      }
    }
  }};
}
