import {test,expect} from '@playwright/test';
import { contrast } from './contrast';
test('built spec: desktop/phone, themes, persistence, no JS, LLM and demo',async({browser,page,request},testInfo)=>{
  for(const path of ['/open-coasters/%2f..%2f..%2f..%2fAGENTS.md','/open-coasters/%zz'])expect((await request.get(path)).status()).toBe(400);
  for(const source of ['spec.md','instance-contract.md','asset-contract.md'])expect((await request.get('/open-coasters/sources/'+source)).status()).toBe(404);
  const llms=await (await request.get('/open-coasters/llms.txt')).text();
  expect(llms).toContain('/open-coasters/assets/figures/tie-frame-light.png');
  expect(llms).toContain('[recipe API](/open-coasters/#placement-reference)');
  await page.goto('/open-coasters/');
  await expect(page.locator('#placement-reference + table')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Contents',exact:true})).toHaveCount(0);
  const headings=await page.locator('main h1,main h2,main h3,main h4,main h5,main h6').evaluateAll(els=>els.map(el=>Number(el.tagName.slice(1))));
  for(let i=1;i<headings.length;i++)expect(headings[i]!-headings[i-1]!).toBeLessThanOrEqual(1);
  const toggle=page.getByRole('button',{name:'Toggle light and dark'});
  await expect(toggle).toHaveText('◐');
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'GitHub',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await expect(page.locator('a.source, a[href*="/sources/"]')).toHaveCount(0);
  await expect(page.locator('header svg')).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('footer a')).toHaveText(['llms.txt','github','license']);
  const hierarchy=await page.locator('h1,h2#asset-contract,h3#instance-contract').evaluateAll(els=>els.map(el=>({tag:el.tagName,size:parseFloat(getComputedStyle(el).fontSize),transform:getComputedStyle(el).textTransform,spacing:getComputedStyle(el).letterSpacing,border:getComputedStyle(el).borderTopWidth})));
  expect(hierarchy.map(h=>h.tag)).toEqual(['H1','H2','H3']);for(let i=1;i<hierarchy.length;i++)expect(hierarchy[i-1]!.size).toBeGreaterThan(hierarchy[i]!.size);
  expect(hierarchy[1]!.size/hierarchy[2]!.size).toBeGreaterThan(1.3);
  for(const width of [1280,390,1920]) {
    await page.setViewportSize({width,height:900});
    for(const theme of ['light','dark'] as const){
      await page.emulateMedia({colorScheme:theme});
      await page.evaluate(()=>{localStorage.clear();delete document.documentElement.dataset.theme;});await page.reload();
      await expect.poll(()=>page.locator('picture img').first().evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain(`tie-frame-${theme}.png`);
      await expect.poll(()=>page.locator('.tie-pair img').last().evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain(`tie-context-${theme}.png`);
      await page.locator('.tie-pair').screenshot({path:testInfo.outputPath(`tie-pair-${width}-${theme}.png`)});
      const panels=await page.locator('.tie-pair img').evaluateAll(imgs=>imgs.map(img=>img.getBoundingClientRect().toJSON()));
      if(width===390) expect(panels[1]!.top).toBeGreaterThan(panels[0]!.bottom);
      else expect(panels[0]!.top).toBe(panels[1]!.top);
      expect(46*panels[0]!.width/1200).toBeGreaterThan(13);
      await page.screenshot({path:testInfo.outputPath(`${width}-${theme}.png`),fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const closing=page.locator('pre').filter({hasText:'const track = join('});
      expect(await closing.evaluate(pre=>pre.scrollWidth<=pre.clientWidth),`${width}px ${theme}: closing code must fit`).toBe(true);
      const toggleBox=(await toggle.boundingBox())!;
      const githubBox=(await page.getByRole('link',{name:'GitHub',exact:true}).boundingBox())!;
      expect(toggleBox.y).toBe(14);
      expect(await page.evaluate(()=>document.body.getBoundingClientRect().right)-toggleBox.x-toggleBox.width).toBe(14);
      expect(githubBox.x+githubBox.width).toBeLessThan(toggleBox.x);
      await page.evaluate(()=>window.scrollBy(0,200));
      expect(await toggle.boundingBox()).toEqual(toggleBox);
      for(const img of await page.locator('picture img').all()) {
        const box=await img.evaluate((el:HTMLImageElement)=>({width:el.width,height:el.height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight, cap:el.closest(':is(.one-tie,.repeated-ties,.swept-rail,.joined-track,.tie-gap)')?540:560}));
        expect(box.width).toBeLessThanOrEqual(box.cap);
        expect(Math.abs(box.width/box.height-box.naturalWidth/box.naturalHeight)).toBeLessThan(.01);
        if(width===390)expect(box.width).toBeGreaterThan(340);
      }
      for(const id of ['profile-contract','construction-contract'])await expect(page.locator('#'+id)).toBeVisible();
      await expect(page.locator('#profile-contract + p')).toContainText('A sweep carries a profile along a path to generate geometry.');
    }
  }
  for (const theme of ['light','dark'] as const) {
    await page.setViewportSize({width:900,height:700});
    await page.emulateMedia({colorScheme:theme});
    await page.evaluate(()=>{localStorage.clear();delete document.documentElement.dataset.theme;});await page.reload();
    const background=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
    for (const [label, link, minimum] of [
      ['body',page.locator('main p a').first(),4.5],
      ['footer',page.locator('footer a').first(),4.5],
      ['icon',page.getByRole('link',{name:'GitHub',exact:true}),3],
    ] as const) {
      await link.hover();
      const color=await link.evaluate(el=>getComputedStyle(el).color);
      expect(contrast(color,background),`${theme} ${label} hover: ${color} on ${background}`).toBeGreaterThanOrEqual(minimum);
      await page.screenshot({path:testInfo.outputPath(`interaction-${theme}-${label}.png`)});
    }
    await page.mouse.move(0,0);await page.getByRole('link',{name:'GitHub',exact:true}).focus();await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    const outline=await toggle.evaluate(el=>({color:getComputedStyle(el).outlineColor,style:getComputedStyle(el).outlineStyle,width:parseFloat(getComputedStyle(el).outlineWidth)}));
    expect(outline.style).not.toBe('none');expect(outline.width).toBeGreaterThan(0);
    expect(contrast(outline.color,background),`${theme} focus outline`).toBeGreaterThanOrEqual(3);
    await page.screenshot({path:testInfo.outputPath(`interaction-${theme}-focus.png`)});
  }
  await page.getByRole('button',{name:'Toggle light and dark'}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect.poll(()=>page.locator('.profile-pair img').first().evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain('profile-light.png');
  for(const title of ['unsupported glTF features (rejected)'])
    await expect(page.getByText(title,{exact:true})).toHaveCount(0);
  const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.getAttribute('href')!));
  for(const href of links){if(href.startsWith('#'))expect(await page.locator(`[id="${href.slice(1)}"]`).count()).toBe(1);else if(href.startsWith('/')) expect((await request.get(href)).ok()).toBe(true);else expect(href).toMatch(/^https:\/\//);}
  const demo=await request.get('/open-coasters/demo/');expect(demo.ok()).toBe(true);const demoHtml=await demo.text();expect(demoHtml).toContain('./assets/');
  for(const match of demoHtml.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g))expect((await request.get('/open-coasters/demo/'+match[1]!.slice(2))).ok()).toBe(true);
  for(const width of [390,1280,1920])for(const theme of ['light','dark'] as const){const context=await browser.newContext({javaScriptEnabled:false,colorScheme:theme,viewport:{width:width,height:844}});const p=await context.newPage();await p.goto('/open-coasters/');await expect(p.locator('h1')).toBeVisible();await expect(p.getByRole('button',{name:'Toggle light and dark'})).toBeHidden();await expect(p.getByRole('navigation')).toHaveCount(0);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect.poll(()=>p.locator('.profile-pair img').first().evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain(`profile-${theme}.png`);await expect.poll(()=>p.locator('.tie-pair img').last().evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain(`tie-context-${theme}.png`);await p.locator('.tie-pair').screenshot({path:testInfo.outputPath(`tie-pair-nojs-${width}-${theme}.png`)});await p.screenshot({path:testInfo.outputPath(`nojs-${width}-${theme}.png`),fullPage:true});await context.close();}
});

test('placement fragments remain navigable without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled:false});
  try {
    const page = await context.newPage();
    for (const [fragment,text] of [
      ['construction-contract--placements','A recipe places parts or sweeps profiles'],
      ['examples--standard-track','standard track'],
    ]) {
      await page.goto('about:blank');
      await page.goto(`/open-coasters/#${fragment}`);
      await expect(page.getByText(text,{exact:false}).first()).toBeVisible();
    }
  } finally { await context.close(); }
});
