import { readFileSync } from 'node:fs';
import { path, sampleFrames } from '../construction/geometry';
import { sampledSection } from '../construction/section';
import { sweep } from '../construction/sweep';
import { railAppearance as metal } from '../demo/src/rail-material';

const source = new URL('../demo/public/assets/assembly-section.gltf', import.meta.url);
const section = JSON.parse(readFileSync(source, 'utf8'));
export const profile = sampledSection(section, section.buffers.map(({ uri }: { uri: string }) =>
    Uint8Array.from(readFileSync(new URL(uri, source))).buffer,
));
export const railPath = path({
    distances: [0, 1.95],
    positions: [[-.5, .065, .75], [-.5, .065, -1.2]],
    rotations: [[0, 0, 0, 1], [0, 0, 0, 1]],
});

const frames = sampleFrames(railPath, [0, 1.95]);
const rail = sweep(profile, frames, metal);

export { frames, rail };
