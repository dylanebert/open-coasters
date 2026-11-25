import assert from 'node:assert/strict';
import { chromium } from 'playwright';

export async function launchNative() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: [
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  ] });
  const session = await browser.newBrowserCDPSession();
  const { gpu } = await session.send('SystemInfo.getInfo');
  console.log(gpu.auxAttributes.glRenderer, gpu.featureStatus.webgpu);
  await session.detach();
  return browser;
}

export async function nativeAdapter(page) {
  const adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return adapter && { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter };
  });
  assert.ok(adapter?.vendor && !adapter.fallback, 'Expected a native WebGPU adapter');
  return adapter;
}
