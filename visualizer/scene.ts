import { Camera, CameraMode, DirectionalLight, GlobalAmbientLight, StandardRenderer, StandardRenderingPlugin, Transform, createApp, lookAtRotation, resetInterpolation } from '@dylanebert/shallot';
import { Tonemapping, TonemappingMethod, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { rawDevice } from '@dylanebert/shallot/runtime';
import { loadGltfScene, spawnGltfScene } from '@dylanebert/shallot/gltf';
import { nativeURL, type Construction } from '../construction/native';
import { Materials, Meshes, MeshInstance, MeshMaterial, StandardMaterial } from '@dylanebert/shallot';
import type { MaterialHandle } from '@dylanebert/shallot/standard/rendering';
import { view } from './view';
import { repeatedView } from './repeated';
import { rails, ghostColor } from './context-rails';

type Guide = Awaited<ReturnType<typeof import('./guide').guidePreview>>;
export async function openScene(canvas: HTMLCanvasElement, initial: Construction, live: boolean, repeated = false, guide?: Guide) {
  const { width, height, size, camera: eye, target: look } = repeated ? repeatedView : view;
  let contextMaterial: MaterialHandle | undefined;
  const railMaterial = (theme: 'light' | 'dark') => StandardMaterial({ baseColor: guide?.course?.color(theme) ?? ghostColor(theme), unlit: true });
  const doc = (guide ? guide.ties : initial.placements[0]?.content)?.snapshot.document;
  let emitter: ReturnType<NonNullable<Guide['emitter']>> | undefined;
  if (doc) {
    // This specimen has one mesh at identity. Its mesh transform is its placement.
    const roots = doc.scenes[doc.scene].nodes;
    const node = doc.nodes[roots[0]];
    if (roots.length !== 1 || node.mesh === undefined ||
      ['children', 'matrix', 'translation', 'rotation', 'scale', 'skin'].some(key => key in node)) {
      throw Error('Expected the archived Blitz tie at its local origin');
    }
  }
  const specimens: number[] = [];
  let spawn: () => number;
  let camera: number;
  // A DOM WebGPU swap chain composites blank on headless Vulkan. Export the
  // live GPU surface as an ImageBitmap instead; only still capture reads pixels.
  const ctx = live ? null : canvas.getContext('2d')!;
  const bitmap = live ? canvas.getContext('bitmaprenderer') : null;
  if (live && !bitmap) throw Error('ImageBitmap presentation unavailable');
  const surface = live ? new OffscreenCanvas(width, height) : null;
  const swap = surface?.getContext('webgpu');
  if (live && !swap) throw Error('Offscreen WebGPU surface unavailable');
  let target: GPUTexture;
  let device: GPUDevice;
  canvas.width = width;
  canvas.height = height;
  const app = await createApp({ pixelRatio: 1, plugins: [{
    name: 'OneTie', dependencies: [StandardRenderingPlugin], async initialize(world) {
      if (doc) {
        const mesh = await loadGltfScene(world, nativeURL(doc));
        spawn = () => {
          const instance = spawnGltfScene(world, mesh);
          if (instance.entities.length !== 1) throw Error('Expected one Blitz tie mesh');
          return instance.entities[0]!;
        };
      }
      emitter = guide?.emitter?.(world);
      if (emitter) world.addSystem(emitter.system);
      if (repeated || guide?.course) {
        contextMaterial = world.resource(Materials).add(railMaterial('light'));
        const rail = world.create();
        world.add(rail, Transform);
        world.add(rail, MeshInstance, { mesh: world.resource(Meshes).add({ name: 'Path context', ...(guide?.course?.mesh ?? rails()) }) });
        world.add(rail, MeshMaterial, contextMaterial);
      }
      Object.assign(world.resource(GlobalAmbientLight), { brightness: 350 });
      const light = world.create();
      world.add(light, DirectionalLight, { illuminance: 1800 });
      world.add(light, Transform, { rotation: lookAtRotation(-1, 2, 3, 0, 0, 0, 0, 1, 0) });
      camera = world.create();
      world.add(camera, Camera, { mode: CameraMode.Orthographic, size, near: .1, far: 10 });
      world.add(camera, Tonemapping, { method: TonemappingMethod.None });
      world.add(camera, StandardRenderer);
      world.add(camera, Transform, { translation: [...eye], rotation: lookAtRotation(eye[0]!, eye[1]!, eye[2]!, look[0]!, look[1]!, look[2]!, 0, 1, 0) });
      target = attachTexture(world, camera, { width, height });
      if (swap) {
        device = rawDevice(world.gpu.device);
        swap.configure({ device, format: target.format, usage: GPUTextureUsage.COPY_DST });
      }
    },
  }] });
  const { world } = app;
  const render = (construction: Construction, bg: string, theme: 'light' | 'dark' = 'light', end?: number) => {
    if (emitter && end !== undefined) emitter.select(end, theme);
    if (contextMaterial) world.resource(Materials).update(contextMaterial, { baseColor: railMaterial(theme).baseColor });
    world.storage(Camera).clearColor.set(camera, parseInt(bg.slice(1), 16));
    const { placements } = construction;
    while (specimens.length > placements.length) world.destroy(specimens.pop()!);
    while (specimens.length < placements.length) specimens.push(spawn());
    const t = world.storage(Transform);
    placements.forEach(({ frame }, i) => {
      const specimen = specimens[i]!;
      t.translation.set(specimen, ...frame.translation as [number, number, number]);
      t.rotation.set(specimen, ...frame.rotation as [number, number, number, number]);
      resetInterpolation(world, specimen);
    });
    world.step(0);
  };
  return {
    render,
    async prepareLive(construction: Construction, bg: string, theme?: 'light' | 'dark', end?: number) {
      if (!surface || !swap || !bitmap) throw Error('Live surface unavailable');
      const filters = ['internal', 'out-of-memory', 'validation'] as const;
      for (const filter of filters) device.pushErrorScope(filter);
      try {
        render(construction, bg, theme, end);
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToTexture({ texture: target }, { texture: swap.getCurrentTexture() }, [target.width, target.height]);
        device.queue.submit([encoder.finish()]);
      } finally {
        // Queue completion alone does not report validation errors. Pop all
        // scopes before yielding, and accept only completed, validated work.
        const scopes = filters.map(() => device.popErrorScope());
        const [errors] = await Promise.all([Promise.all(scopes), device.queue.onSubmittedWorkDone()]);
        const refusal = errors.find(Boolean);
        if (refusal) throw Error(refusal.message);
      }
      // Export only if the host still accepts this request. No rejected or
      // superseded frame owns an ImageBitmap.
      return () => {
        const image = surface.transferToImageBitmap();
        try { bitmap.transferFromImageBitmap(image); }
        finally { image.close(); }
      };
    },
    async holdStill() {
      await world.frameFence;
      const { rgba, width, height } = await captureTexture(world, camera);
      ctx!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      // Let the browser present the completed bitmap before advertising readiness.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    dispose() {
      swap?.unconfigure();
      app.dispose();
    },
  };
}
