import { expect, test } from '@playwright/test';
test('Pages build presents metric scene and responds to orbit and zoom', async ({page}) => {
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    const step = () => page.evaluate(() => (window as unknown as {step:()=>Promise<void>}).step());
    await page.goto('./?stepped');
    await page.locator('body[data-ready="true"]').waitFor();
    await expect(page.getByText('Reference block · 3 × 2 × 1 m (X × Y × Z)')).toBeVisible();
    const canvas=page.locator('canvas');
    const pixels=async()=>{
        const png=await canvas.screenshot();
        return page.evaluate(async b64=>{
            const image=await createImageBitmap(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))]));
            const c=new OffscreenCanvas(image.width,image.height), ctx=c.getContext('2d')!;
            ctx.drawImage(image,0,0); image.close(); return Array.from(ctx.getImageData(0,0,c.width,c.height).data);
        },png.toString('base64'));
    };
    const before=await pixels();
    expect(before.filter((v,i)=>Math.abs(v-before[i%4])>8).length).toBeGreaterThan(1000);
    await page.screenshot({path:'/tmp/open-coasters-reference.png'});
    await page.mouse.move(800,450); await page.mouse.down();
    await step();
    for(let i=1;i<=12;i++) { await page.mouse.move(800+i*16,450+i*8); await step(); }
    await page.mouse.up(); await step();
    const changed=async (prior:number[])=>{const next=await pixels();return next.filter((v,i)=>Math.abs(v-prior[i])>8).length;};
    expect(await changed(before)).toBeGreaterThan(1000);
    const orbited=await pixels();
    await page.mouse.wheel(0,-400); await page.waitForTimeout(100); await step();
    expect(await changed(orbited)).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
});
