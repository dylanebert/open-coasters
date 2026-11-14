// Summarize saved raw evidence only; does not run the workload or alter its oracle.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const dir=resolve(process.argv[2]??'/home/dylan/.local/share/open-coasters/placement-architecture');
const load=async(name:string)=>JSON.parse(await readFile(resolve(dir,name),'utf8'));
const baseline=await load('baseline.json');
const stats=(a:number[])=>{a.sort((x,y)=>x-y);return {n:a.length,min:a[0],median:a.length%2?a[a.length>>1]:(a[(a.length>>1)-1]+a[a.length>>1])/2,p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1),sum:a.reduce((s,x)=>s+x,0)};};
const updates=baseline.final.updates, phases:Record<string,number[]>={};
for(const p of baseline.final.phases)(phases[p.name]??=[]).push(p.ms);
const counters=baseline.final.counts;
const result:any={source:await load('source.json'),adapter:baseline.adapter,elapsedMs:baseline.elapsedMs,updates:updates.length,workload:baseline.workload,updateMs:stats(updates.map((u:any)=>u.ms)),inputToCompletedFrameMs:stats(updates.map((u:any)=>u.inputToFrame)),phaseMs:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,stats(v)])),counters,perEditCounters:Object.fromEntries(Object.entries(counters).map(([k,v])=>[k,(v as number)/updates.length])),oracle:baseline.oracle};
for(const key of ['allocations','uploads']) {
  const groups:any={};for(const v of baseline.final[key]) {const k=String(v.label??'(unlabelled)');const g=groups[k]??={calls:0,bytes:0};g.calls++;g.bytes+=v.bytes??v.size;}
  result[key]=groups;
}
const profile=await load('baseline.cpuprofile'), nodes=new Map(profile.nodes.map((n:any)=>[n.id,n])), maps=new Map<string,TraceMap>(), totals:Record<string,number>={};
for(let i=0;i<profile.samples.length;i++) {
  const f=(nodes.get(profile.samples[i]) as any).callFrame;let name=f.functionName;
  if(f.url?.includes('/assets/')) {
    const file=resolve(dir,'built/assets',f.url.split('/').at(-1)+'.map');
    if(!maps.has(file))maps.set(file,new TraceMap(JSON.parse(await readFile(file,'utf8'))));
    const p=originalPositionFor(maps.get(file)!,{line:f.lineNumber+1,column:f.columnNumber});
    name=`${p.source}:${p.line} ${p.name??f.functionName}`;
  }
  totals[name]=(totals[name]??0)+profile.timeDeltas[i]/1000;
}
result.sampledSelfMs=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,30);
for(const mode of ['input-default','input-assembly','input-supports']) {
  const r=await load(mode+'.json');result[mode]={elapsedMs:r.elapsedMs,findings:r.interactionFindings,oracle:r.oracle,supportOracle:r.supportOracle,errors:r.errors,failure:r.failure};
}
await writeFile(resolve(dir,'summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
