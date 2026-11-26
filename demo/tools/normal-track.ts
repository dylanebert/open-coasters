import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGltf, type GltfJson } from '@dylanebert/shallot/gltf';
import { frame } from '../../construction/geometry';
import { contentValue, nativeSnapshot, resolvedNative, type NativeDocument } from '../../construction/native';
import { normalTrack, stationGap } from '../../construction/normal-track';
import { sampledSection } from '../../construction/section';
import { railAppearance } from '../src/assembly';

const defaults = new URL('../../examples/normal-track.json', import.meta.url);
const usage = `Usage: bun demo/tools/normal-track.ts [<params.json>]

Default parameters: examples/normal-track.json

Inputs (meters; XYZW rotations; local -Z travel):
  path        Sample distances, positions and rotations (construction/geometry.ts).
              Each rail's endpoints must differ, and each chord must advance
              along local -Z at both frames (construction/sweep.ts).
  profile     Restricted .gltf section, not an arbitrary Profile: a directed,
              indexed LINES cycle in an identity local frame, decoded to a
              strictly convex CCW XY section (construction/section.ts, sampledSection).
  tie         Static part (.gltf)
  separation  Center-to-center rail distance
  spacing     Tie spacing
  startOffset Optional tie phase (default 0)
  excluded    Optional half-open distance spans [{start, end}]
  custom      Optional parts [{asset, pose}] with explicit world poses

Local asset paths resolve relative to the parameter file. See
construction/normal-track.ts for rail and tie parameter bindings. Rail walls
and caps use the demo's fixed native material, independent of the tie.

Output: JSON with placementCount, poses (rails, ties, then custom parts),
world bounds {min, max}, and gltfPath to a self-contained temporary .gltf file.`;

function members(value: unknown, required: string[], optional: string[] = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        required.some(key => !Object.hasOwn(value, key)) ||
        Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
        throw Error(`expected ${required.join(', ')}${optional.length ? ` (optional: ${optional.join(', ')})` : ''}`);
    }
}

async function buffer(uri: unknown, base?: URL): Promise<ArrayBuffer> {
    if (typeof uri !== 'string' || !uri) throw Error('buffer URI required');
    const url = new URL(uri, base);
    if (url.protocol === 'file:') return Bun.file(url).arrayBuffer();
    if (url.protocol === 'data:') return (await fetch(url)).arrayBuffer();
    throw Error(`only local or embedded buffers supported: ${url.href}`);
}

// Column-major glTF T·R·S. Use JSON numbers, not the renderer's float32 matrices
// (or its TRS decomposition of authored matrices).
function localMatrix(node: NonNullable<GltfJson['nodes']>[number]): number[] {
    if (node.matrix) return node.matrix;
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    return [
        (1 - 2 * (y*y + z*z)) * sx, 2 * (x*y + z*w) * sx, 2 * (x*z - y*w) * sx, 0,
        2 * (x*y - z*w) * sy, (1 - 2 * (x*x + z*z)) * sy, 2 * (y*z + x*w) * sy, 0,
        2 * (x*z + y*w) * sz, 2 * (y*z - x*w) * sz, (1 - 2 * (x*x + y*y)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

function multiply(parent: number[], local: number[]): number[] {
    return local.map((_, i) => {
        const row = i % 4, col = i - row;
        return parent[row] * local[col] + parent[row + 4] * local[col + 1] +
            parent[row + 8] * local[col + 2] + parent[row + 12] * local[col + 3];
    });
}

async function run(input: URL) {
    const params = await Bun.file(input).json();
    members(params, ['path', 'profile', 'tie', 'separation', 'spacing'], ['startOffset', 'excluded', 'custom']);
    if (params.custom !== undefined && !Array.isArray(params.custom)) throw Error('custom must be an array');
    const directory = dirname(fileURLToPath(input));
    async function asset<T>(label: string, name: unknown, decode: (doc: NativeDocument, buffers: ArrayBuffer[]) => T) {
        if (typeof name !== 'string' || !name || /^[a-z][a-z\d+.-]*:/i.test(name)) {
            throw Error(`${label}: local asset path required`);
        }
        const url = pathToFileURL(resolve(directory, name));
        try {
            const doc = await Bun.file(url).json();
            const buffers = await Promise.all((doc.buffers ?? []).map((b: { uri?: string }) => buffer(b.uri, url)));
            return decode(doc, buffers);
        } catch (error) {
            throw Error(`${label} ${fileURLToPath(url)}: ${message(error)}`);
        }
    }
    const part = (doc: NativeDocument, bytes: ArrayBuffer[]) => contentValue({ snapshot: nativeSnapshot(doc, bytes) });
    const section = await asset('profile', params.profile, sampledSection);
    const tieContent = await asset('tie', params.tie, part);
    const custom = [];
    for (const [i, entry] of (params.custom ?? []).entries()) {
        let pose;
        try {
            members(entry, ['asset', 'pose']);
            pose = frame(entry.pose);
        } catch (error) {
            throw Error(`custom[${i}]: ${message(error)}`);
        }
        custom.push({ content: await asset(`custom[${i}].asset`, entry.asset, part), frames: [pose] });
    }
    const parameters = {
        path: params.path, section, tieContent, separation: params.separation, spacing: params.spacing,
        startOffset: params.startOffset, excluded: params.excluded, material: railAppearance,
    };
    const result = custom.length ? stationGap(parameters, custom) : normalTrack(parameters);
    const document = resolvedNative(result) as GltfJson;
    const scene = parseGltf(document, await Promise.all(document.buffers!.map(b => buffer(b.uri))));
    // Shallot has already selected and ordered the hierarchy. The native export
    // gives each placed node a unique JSON index, also used by mesh instances.
    const world = new Map<number, number[]>();
    for (const { index, parent } of scene.nodes) {
        const local = localMatrix(document.nodes![index]);
        world.set(index, parent < 0 ? local : multiply(world.get(scene.nodes[parent].index)!, local));
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const instance of scene.instances) {
        const { vertices, indices } = scene.meshes[instance.mesh];
        const m = world.get(instance.nodeIndex)!;
        for (const index of indices) {
            // Shallot packs XYZ at the start of each eight-float vertex.
            const i = index * 8;
            for (let row = 0; row < 3; row++) {
                const x = m[row] * vertices[i] + m[row + 4] * vertices[i + 1] + m[row + 8] * vertices[i + 2] + m[row + 12];
                min[row] = Math.min(min[row], x);
                max[row] = Math.max(max[row], x);
            }
        }
    }
    if (![...min, ...max].every(Number.isFinite)) throw Error('resolved glTF has no finite world bounds');
    const poses = result.placements.map(p => p.frame);
    const bytes = JSON.stringify(document);
    const temporary = mkdtempSync(join(tmpdir(), 'open-coasters-normal-track-'));
    try {
        const gltfPath = join(temporary, 'normal-track.gltf');
        const report = JSON.stringify({ placementCount: poses.length, poses, bounds: { min, max }, gltfPath });
        writeFileSync(gltfPath, bytes, { flag: 'wx' });
        console.log(report);
    } catch (error) {
        rmSync(temporary, { recursive: true, force: true });
        throw Error(`export: ${message(error)}`);
    }
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
} else if (args.length > 1 || args[0]?.startsWith('-')) {
    console.error('NormalTrack: use a single parameter path or --help');
    process.exitCode = 1;
} else {
    const input = args.length ? pathToFileURL(resolve(args[0])) : defaults;
    try {
        await run(input);
    } catch (error) {
        console.error(`NormalTrack (${fileURLToPath(input)}): ${message(error)}`);
        process.exitCode = 1;
    }
}
