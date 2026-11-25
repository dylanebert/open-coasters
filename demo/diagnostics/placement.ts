// Run from demo: bun diagnostics/placement.ts build|input-default|input-assembly|input-supports|baseline <artifact-dir>
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { BROWSER_CONFIG } from '@dylanebert/shallot/testing';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import fixture from './placement-fixture.json';
function railOracle(gpu: any, separation: number, straight = false) {
  if(!gpu) throw Error('No actual GPU rail output');
  // The historical curve fixture stores the +Z-travel basis. Keep its
  // centerline and up, but negate the old local X for the live rail oracle.
  const stations = straight ? fixture.stations.map((_,i)=>({p:[0,1.5,6-12*i/96],x:[1,0,0],y:[0,1,0]})) : fixture.stations.map(f=>({...f,x:f.x.map(v=>-v)}));
  const expected = [-1,1].flatMap(side => stations.flatMap(f => fixture.section.map(v => f.p.map((p,j) => p+f.x[j]*(side*separation/2+v[0])+f.y[j]*v[1]))));
  const tolerance=fixture.tolerance, cells = new Map<string,number[]>();
  expected.forEach((p,i)=>{const k=p.map(v=>Math.floor(v/tolerance)).join(',');cells.set(k,[...(cells.get(k)??[]),i]);});
  let maxError=0;const seen=new Set<number>();
  for(const p of gpu.positions) {
    const c=p.map((v:number)=>Math.floor(v/tolerance));let best=Infinity,id=-1;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of cells.get([c[0]+x,c[1]+y,c[2]+z].join(','))??[]) {
      const err=Math.hypot(...p.map((v:number,j:number)=>v-expected[i][j])); if(err<best){best=err;id=i;}
    }
    if(best>tolerance)throw Error(`GPU rail vertex not within independent fixture: ${p}; error ${best}`);
    maxError=Math.max(maxError,best);seen.add(id);
  }
  if(seen.size!==expected.length)throw Error(`GPU only covered ${seen.size}/${expected.length} expected ring vertices`);
  return {separation,expectedPoints:expected.length,actualIndexedVertices:gpu.positions.length,maxError,tolerance};
}
const [mode, outputArg] = process.argv.slice(2);
const output = resolve(outputArg ?? '/home/dylan/.local/share/open-coasters/placement-architecture');
const root = resolve(import.meta.dir, '..'), built = resolve(output, 'built');
await mkdir(output, { recursive: true });
const save = (name: string, value: any) => writeFile(resolve(output, name), JSON.stringify(value, null, 2));
if (mode === 'build') {
  await save('source.json', { revision: execSync('git rev-parse HEAD').toString().trim(), status: execSync('git status --short').toString(), hostname: execSync('hostname').toString().trim(), bun: Bun.version, command: process.argv, budget: { inputMs: 60000, baselineMs: 90000 }, installedShallot: JSON.parse(await readFile(resolve(root,'node_modules/@dylanebert/shallot/package.json'),'utf8')).version });
  await build({ root, base:'/open-coasters/', build: { outDir: built, emptyOutDir: true, sourcemap: true }, plugins: [{
    name: 'placement-diagnostic-only', enforce: 'pre',
    transform(source, id) {
      if (id === resolve(root, 'src/main.ts')) {
        source = `import { install as diagnosticInstall } from ${JSON.stringify(resolve(import.meta.dir,'placement-runtime.ts'))};\n` + source;
        source = source.replace('  const form =', '  const diagnostic = diagnosticInstall(app, live);\n  const form =');
        source = source.replace('        await app.world.gpu.device.queue.onSubmittedWorkDone();', "        const syncStart = performance.now();\n        await app.world.gpu.device.queue.onSubmittedWorkDone();\n        diagnostic.phases.push({name:'submittedWorkWait', ms:performance.now()-syncStart});");
        source = source.replace('      app.world.step(dt);\n      await app.world.frameFence;', "      const drawStart = performance.now();\n      app.world.step(dt);\n      const stepEnd = performance.now();\n      await app.world.frameFence;\n      diagnostic.phases.push({name:'world.step',ms:stepEnd-drawStart},{name:'frameFence',ms:performance.now()-stepEnd});\n      diagnostic.frame();");
        return source;
      }
      if (id === resolve(root, 'src/live.ts')) {
        return source.split('\n').map(line => {
          for (const name of ['constructDemo', 'packRails']) {
            const prefix = name === 'constructDemo' ? '      const resolved = ' : '      const mesh = ';
            if (line.startsWith(prefix + name + '(')) {
              const expr = line.slice(prefix.length, -1);
              return prefix + `((globalThis as any).__placement?.time ?? ((_name: string, f: () => any) => f()))('${name}', () => ${expr});`;
            }
          }
          return line;
        }).join('\n');
      }
    }
  }] });
  process.exit(0);
}
if (!['input-default','input-assembly','input-supports','baseline'].includes(mode)) throw Error('unknown mode');
const server = await preview({ root, base:'/open-coasters/', build: { outDir: built }, preview: { host:'127.0.0.1', port:4179, strictPort:true } });
const browser = await chromium.launch({ ...BROWSER_CONFIG.use.launchOptions, headless:true, channel:'chromium' });
const page = await browser.newPage({ viewport:{width:1280,height:800} });
page.setDefaultTimeout(12000);
const consoleErrors: string[] = []; page.on('pageerror', e => consoleErrors.push(String(e))); page.on('console', m => { if(m.type()==='error'||m.type()==='warning') consoleErrors.push(m.text()); });
const route = mode === 'input-default' ? '' : '?example=' + (mode === 'input-supports' ? 'supports' : 'assembly');
let timer: ReturnType<typeof setTimeout> | undefined;
const log: any = { mode, route:'/open-coasters/'+route, commands:process.argv, errors:consoleErrors, actions:[] };
const state = () => page.evaluate(() => { const d = (window as any).__placement; return { frames:d.frames, updates:d.updates, phases:d.phases, counts:d.counts, events:d.events, allocations:d.allocations, uploads:d.uploads, instances:d.instances(), meshes:d.meshes(), active:document.activeElement?.getAttribute('name'), fields:[...document.querySelectorAll('input[type=number]')].filter((e:any)=>e.checkVisibility()).map((e:any)=>({name:e.name,label:e.parentElement.textContent,value:e.value,disabled:e.disabled,min:e.min,max:e.max,step:e.step})) }; });
const wait = async () => { const frames = await page.evaluate(() => (window as any).__placement.frames); await page.waitForFunction(n => (window as any).__placement.frames > n+1,frames); };
const snapshot = async (name:string, screenshot=false) => { await wait(); log.actions.push({name,...await state()}); if(screenshot) await page.screenshot({path:resolve(output,`${mode}-${name}.png`)}); };
const drag = async (name:string, delta=40, end='up') => {
  const label = page.locator(`[name="${name}"]`).locator('..'), b = (await label.boundingBox())!;
  const x=b.x+8,y=b.y+b.height/2; await page.mouse.move(x,y); await page.mouse.down();
  // Real multi-move gesture. No manual stepping and no frame wait between moves.
  for (let i=1;i<=8;i++) await page.mouse.move(x+delta*i/8,y);
  if(end==='cancel') await label.dispatchEvent('pointercancel',{pointerId:1,isPrimary:true});
  if(end==='lost') await label.evaluate((e:any)=>{if(e.hasPointerCapture(1))e.releasePointerCapture(1);});
  await page.mouse.up();
};
try {
  await page.goto('http://127.0.0.1:4179/open-coasters/'+route);
  await page.locator('body[data-ready=true]').waitFor({ timeout:30000 });
  const started = performance.now();
  timer=setTimeout(()=>{void browser.close();},mode==='baseline'?90000:60000);
  log.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {info:a?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null,features:[...(a?.features??[])],fallback:a?.info.isFallbackAdapter};});
  await snapshot('before',true);
  if(mode==='baseline') {
    // Freeze 16 legal separation values, spanning the full range, unchanged default ties.
    const values=fixture.workload.values;
    log.workload=fixture.workload;
    const input=page.locator('[name=assembly-separation]');
    const edit=async(value:number)=>{await input.fill(String(Number(value.toFixed(2))));await input.press('Enter');await wait();};
    for(const v of log.workload.warm)await edit(v);
    await page.evaluate(()=>{const d=(window as any).__placement;d.updates=[];d.phases=[];d.counts={};d.events=[];d.allocations=[];d.uploads=[];});
    const cdp=await page.context().newCDPSession(page); await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    for(let sweep=0;sweep<3;sweep++)for(const v of values) { const before=await page.evaluate(()=>({...((window as any).__placement.counts)})); const t=performance.now();await edit(v);log.actions.push({sweep,value:v,wallMs:performance.now()-t,before,after:await page.evaluate(()=>({...((window as any).__placement.counts)})),meshes:await page.evaluate(()=>(window as any).__placement.meshes())}); }
    const profile=await cdp.send('Profiler.stop');await save('baseline.cpuprofile',profile.profile);
    log.final=await state();
    log.gpu=await page.evaluate(()=>(window as any).__placement.readRails());
    log.oracle=railOracle(log.gpu,values.at(-1)!);
    await page.screenshot({path:resolve(output,'baseline-after.png')});
  } else {
    const name=mode==='input-default'?'separation':mode==='input-supports'?'assembly-post1':'assembly-separation';
    await drag(name);await snapshot('drag',true);
    if(mode==='input-assembly') {log.dragGPU=await page.evaluate(()=>(window as any).__placement.readRails());log.dragOracle=railOracle(log.dragGPU,1.6);}
    if(mode==='input-default') {await page.locator('[name=component]').selectOption('local');await snapshot('parametric');await drag(name);await snapshot('active-drag',true);}
    const input=page.locator(`[name=${name}]`);
    await input.fill(mode==='input-supports'?'3.125':'1.4');await input.press('Enter');await snapshot('typed',true);
    if(mode==='input-supports')log.supportExpected={from:2,to:3.125,translation:[0,0,2-3.125]};
    if(mode!=='input-default') {log.typedGPU=await page.evaluate(()=>(window as any).__placement.readRails());log.oracle=railOracle(log.typedGPU,mode==='input-supports'?1.2:1.4,mode==='input-supports');}
    await input.press('ArrowUp');await input.blur();await snapshot('arrow');
    await page.keyboard.press('Control+z');await snapshot('undo');
    await page.keyboard.press('Control+Shift+z');await snapshot('redo');
    await drag(name,-20,'cancel');await snapshot('cancel');
    await page.keyboard.press('Control+z');await snapshot('cancel-undo');
    await page.keyboard.press('Control+Shift+z');await snapshot('cancel-redo');
    await drag(name,-20,'lost');await snapshot('lost-capture');
    await page.keyboard.press('Control+z');await snapshot('lost-undo');
    await page.keyboard.press('Control+Shift+z');await snapshot('lost-redo');
    await input.focus();await snapshot('focus');
    await input.press('Control+a');await input.press('Backspace');await input.type('1.25');await input.blur();await snapshot('typing-keys');
    for(const field of (await state()).fields.filter((f:any)=>!f.disabled && f.name!==name)) {
      await drag(field.name,8);await snapshot('enumerated-drag-'+field.name);
      const f=page.locator(`[name=${field.name}]`);await f.fill(String(field.name==='assembly-post2'?9.125:field.value));await f.press('Enter');await snapshot('enumerated-type-'+field.name);
      await f.press('ArrowUp');await f.blur();await snapshot('enumerated-arrow-'+field.name);
    }
  }
  log.elapsedMs=performance.now()-started;
  if(mode==='input-supports') {
    const before=log.actions.find((a:any)=>a.name==='before'), typed=log.actions.find((a:any)=>a.name==='typed'), typed2=log.actions.find((a:any)=>a.name==='enumerated-type-assembly-post2');
    const first=typed.instances.at(-2)[0], second=typed.instances.at(-1)[0];
    if(JSON.stringify(first)!==JSON.stringify([0,0,6-3.125])||JSON.stringify(second)!==JSON.stringify([0,0,6-10]))throw Error('Support 1 typing failed independent six-minus-station transform oracle');
    if(JSON.stringify(typed2.instances.at(-1)[0])!==JSON.stringify([0,0,6-9.125]))throw Error('Support 2 typing failed independent transform oracle');
    log.supportOracle={first,second,typedSecond:typed2.instances.at(-1)[0],unchangedAfterDeadDrag:JSON.stringify(before.instances)===JSON.stringify(log.actions.find((a:any)=>a.name==='drag').instances)};
  }
  if(mode.startsWith('input-')) {
    const actions=log.actions;
    log.interactionFindings=actions.filter((a:any)=>a.name==='drag'||a.name.startsWith('enumerated-drag-')).map((a:any)=>{
      const key=a.name==='drag'?(mode==='input-default'?'separation':mode==='input-supports'?'assembly-post1':'assembly-separation'):a.name.slice('enumerated-drag-'.length);
      const prior=actions[actions.indexOf(a)-1],from=prior.fields.find((f:any)=>f.name===key),to=a.fields.find((f:any)=>f.name===key);
      return {name:key,from:from.value,to:to.value,disabled:to.disabled,boundary:from.value===to.value?(to.disabled?'intentional-disabled':'active-label-drag-no-change'):'changed'};
    });
  }
} catch(error) {log.failure=String(error); await page.screenshot({path:resolve(output,mode+'-failure.png')}).catch(()=>{});} finally {
  if(timer)clearTimeout(timer);
  await save(mode+'.json',log);await browser.close();await new Promise<void>(r=>server.httpServer.close(()=>r()));
}
if(log.failure) { console.error(log.failure);process.exitCode=1;} else console.log(`${mode}: complete; artifacts ${output}`);
