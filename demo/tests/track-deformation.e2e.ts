import { expect, test, type Page } from '@playwright/test';
import { changedPixels, nonblank, pixels, pixelsFromPng } from './pixels';

test.use({viewport:{width:800,height:500}});

const ordinary = './?example=track&configuration=curve';
const replay = './?replay=track';
const ready = (page: Page) => page.locator('body[data-ready=true]').waitFor();
const step = (page: Page, seconds: number) => page.evaluate(t => (window as any).step(1/60, t), seconds);
const scene = (page: Page) => page.evaluate(() => {
  const { demo } = window as any;
  return { meshes: demo.meshes(), orbit: demo.orbit(), rows: demo.instances() };
});

test('built ordinary curve and opt-in replay share the scene; canvas bends, returns and holds', async ({page}, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(ordinary+'&stepped');
  await ready(page);
  await step(page, 0);
  const stock=await scene(page);
  expect(stock.rows).toHaveLength(22);
  expect(stock.meshes.slice(0,2)).toEqual([
    {name:'Track rails', indexCount:37032}, {name:'Track spine',indexCount:27780},
  ]);
  const baseline=await page.locator('canvas').screenshot({path:info.outputPath('ordinary.png')});

  await page.goto(replay+'&stepped');
  await ready(page);
  expect(await scene(page)).toEqual(stock);
  const size: [number,number] = [640,400];
  const sample=async(label:string)=>pixelsFromPng(page,await page.locator('canvas').screenshot({path:info.outputPath(`${label}.png`)}),size);
  const rest=await sample('rest');
  const stockPixels=await pixelsFromPng(page,baseline,size);
  expect(await changedPixels(rest,stockPixels),'replay opening rest vs ordinary canvas').toBeLessThan(640);
  expect(await nonblank(rest)).toBeGreaterThan(10_000);
  let previous=rest;
  for(const [label,t] of [['intermediate-in',2.5],['maximum',4],['intermediate-out',5.5],['final-rest',7],['held',8]] as const) {
    await step(page,t);
    const current=await scene(page);
    expect(current.orbit,label).toEqual(stock.orbit);
    expect(current.meshes,label).toEqual(stock.meshes);
    expect(current.rows,label).toHaveLength(22);
    const image=await sample(label);
    if(t<7) {
      expect(current.rows[2],label).not.toEqual(stock.rows[2]);
      expect(await changedPixels(image,rest),`${label} vs rest`).toBeGreaterThan(900);
      expect(await changedPixels(image,previous),`${label} vs preceding pose`).toBeGreaterThan(900);
    } else {
      expect(current.rows,label).toEqual(stock.rows);
      expect(await changedPixels(image,rest),`${label} vs rest`).toBe(0);
    }
    if(previous!==rest)await previous.dispose();
    previous=image;
  }
  await page.reload();await ready(page);
  expect(await scene(page),'reload starts at rest').toEqual(stock);
  expect(errors).toEqual([]);
});

test('plain private URL plays without stepping and settles', async ({page}) => {
  await page.goto(replay);
  await ready(page);
  expect(await page.evaluate(() => 'step' in window)).toBe(false);
  const size: [number,number] = [640,400];
  const first=await pixels(page,size);
  // The actual playback clock is not replaced by a stepped simulation clock.
  await expect.poll(async()=>{
    const image=await pixels(page,size);
    try{return await changedPixels(image,first);}finally{await image.dispose();}
  },{timeout:5500,intervals:[400]}).toBeGreaterThan(950);
  await expect.poll(async()=>{
    const image=await pixels(page,size);
    try{return await changedPixels(image,first);}finally{await image.dispose();}
  },{timeout:8500,intervals:[400]}).toBe(0);
  const held=await pixels(page,size);
  expect(await changedPixels(held,first)).toBe(0);
});
