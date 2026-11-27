import { Camera, DirectionalLight, GlobalAmbientLight, StandardRenderer, StandardRenderingPlugin, Transform, lookAtRotation } from '@dylanebert/shallot';
import { loadGltfScene, spawnGltfScene } from '@dylanebert/shallot/gltf';
import { Tonemapping, TonemappingMethod, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { nativeURL, resolvedNative, type Construction } from '../../construction/native';
import { view, project } from '../../visualizer/view';
import { cameraConfiguration, cameraTransform, palettes } from '../src/plate';
import { wallColors } from '../src/profile-extrusion';
import { firstRail, joinedTrack, linearRgba, loadTrackInputs, repeatedTies } from '../src/track-recipes';
import { tieGap } from '../src/guide-recipe';

type Vec = Parameters<typeof project>[0];
type Theme = keyof typeof palettes;
const inputs = await loadTrackInputs();
const { path } = inputs;
const { near } = firstRail(inputs);
const { width, height } = view;

function captureDocument(construction: Construction, rails: number, theme: Theme) {
  const doc = resolvedNative(construction);
  if (!rails) return doc;
  // The capture palette is illustrative; do not change the recipe's native material.
  const painted = structuredClone(doc);
  const materials = painted.materials ??= [];
  const wall = materials.length;
  materials.push(...[wallColors[theme], palettes[theme].ink].map(hex => ({
    pbrMetallicRoughness: { baseColorFactor: linearRgba(hex) }, extensions: { KHR_materials_unlit: {} },
  })));
  painted.extensionsUsed = [...new Set([...(painted.extensionsUsed ?? []), 'KHR_materials_unlit'])];
  const roots = painted.scenes[painted.scene].nodes;
  for (const root of roots.slice(0, rails)) {
    const mesh = painted.nodes[painted.nodes[root].children[0]].mesh;
    const primitives = painted.meshes[mesh].primitives;
    if (primitives.length !== 2) throw Error('Expected rail wall and cap primitives');
    primitives.forEach((p, i) => { p.material = wall + i; });
  }
  return painted;
}

type Plate = {
  make: (...args: number[]) => Construction;
  rails: number;
  centerline?: boolean;
  label?: boolean;
};
const plates = {
  'curved-ties': { make: (spacing?: number) => repeatedTies(inputs, spacing), rails: 0, centerline: true },
  'swept-rail': { make: (end?: number) => firstRail(inputs, end).rail, rails: 1, centerline: true, label: true },
  'joined-track': { make: (spacing?: number, end?: number) => joinedTrack(inputs, spacing, end), rails: 2 },
  'tie-gap': { make: () => joinedTrack(inputs, undefined, undefined, tieGap()), rails: 2 },
} satisfies Record<string, Plate>;

const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
const raw = { width, height, channels: 4 as const };
const app = await openGpuApp({ plugins: [StandardRenderingPlugin] });
const w = app.world;
try {
  Object.assign(w.resource(GlobalAmbientLight), { brightness: 350 });
  const light = w.create();
  w.add(light, DirectionalLight, { illuminance: 1800 });
  w.add(light, Transform, { rotation: lookAtRotation(-1, 2, 3, 0, 0, 0, 0, 1, 0) });
  const camera = w.create();
  w.add(camera, Tonemapping, { method: TonemappingMethod.None });
  w.add(camera, StandardRenderer);
  w.add(camera, Camera, cameraConfiguration(view));
  w.add(camera, Transform, cameraTransform(view));
  attachTexture(w, camera, { width, height });
  for (const [stem, plate] of Object.entries<Plate>(plates)) {
    const track = plate.make();
    for (const theme of ['light', 'dark'] as const) {
      const { bg, ink } = palettes[theme];
      w.add(camera, Camera, { ...cameraConfiguration(view), clearColor: parseInt(bg.slice(1), 16) });
      const doc = captureDocument(track, plate.rails, theme);
      const { entities } = spawnGltfScene(w, await loadGltfScene(w, nativeURL(doc)));
      w.step(0);
      await w.frameFence;
      const plane = Buffer.from((await captureTexture(w, camera)).rgba);
      let image = sharp(plane, { raw });
      if (plate.centerline) {
        const course = 'M' + path.positions.map(p => project(p as Vec, view)).join('L');
        const stroke = theme === 'light' ? '#c3c4bd' : '#51534d';
        const base = svg(`<rect width="100%" height="100%" fill="${bg}"/><path d="${course}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`);
        // The clear color outside opaque native geometry reveals the quiet path beneath it.
        const [r, g, b] = plane;
        for (let i = 0; i < plane.length; i += 4) {
          if (plane[i] === r && plane[i + 1] === g && plane[i + 2] === b) plane[i + 3] = 0;
        }
        const layers: sharp.OverlayOptions[] = [{ input: plane, raw }];
        if (plate.label) {
          const [x, y] = project(near as Vec, view);
          layers.push({ input: svg(`<path d="M${x! - 11},${y! + 10}l-10,32" stroke="${ink}" stroke-width="2.5" fill="none"/><text x="${x! - 29}" y="${y! + 52}" text-anchor="end" fill="${ink}" font-family="sans-serif" font-size="42">profile</text>`) });
        }
        image = sharp(base).composite(layers);
      }
      const file = resolve(import.meta.dir, '../../assets/figures', `${stem}-${theme}.png`);
      await image.png({ compressionLevel: plate.centerline ? 3 : 2 }).toFile(file);
      for (const entity of entities) w.destroy(entity);
    }
  }
} finally {
  app.dispose();
}
