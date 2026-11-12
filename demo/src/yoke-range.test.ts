import { expect, test } from "bun:test";
import { defaults, generate, type Configuration } from "./track";

// Width/depth affect only affine sweep sections, whose full control box is
// enclosed by the separate interval-clearance proof. Gauge and station phase
// affect yoke triangulation. Exercise their entire UI lattices, not a diagonal
// selection through that Cartesian product. No GPU/runtime budget is changed.
for (const configuration of ["straight","curve","loop"] as Configuration[])
  for (let spacingTick=0;spacingTick<=24;spacingTick++)
    test(`${configuration}: all gauges at spacing tick ${spacingTick}`,()=>{
      let smallest=Infinity, worstNormal=1, bad=0;
      for (let gaugeTick=0;gaugeTick<=20;gaugeTick++) {
        const p={...defaults,configuration,spacing:(30+spacingTick*5)/100,separation:(60+gaugeTick*5)/100};
        const {vertices:v,indices}=generate(p);
        for (let i=0;i<indices.length;i+=3) {
          const a=indices[i]*8,b=indices[i+1]*8,c=indices[i+2]*8;
          const ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2];
          const vx=v[c]-v[a],vy=v[c+1]-v[a+1],vz=v[c+2]-v[a+2];
          const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,size=Math.hypot(nx,ny,nz);
          smallest=Math.min(smallest,size);
          if (!Number.isFinite(size) || size===0) { bad++; continue; }
          for (const offset of [a,b,c]) {
            const alignment=(nx*v[offset+4]+ny*v[offset+5]+nz*v[offset+6])/size;
            worstNormal=Math.min(worstNormal,alignment);
            if (!Number.isFinite(alignment)) bad++;
          }
        }
      }
      expect(bad).toBe(0);
      expect(smallest).toBeGreaterThan(1e-10);
      expect(worstNormal).toBeGreaterThan(.99999);
    });
