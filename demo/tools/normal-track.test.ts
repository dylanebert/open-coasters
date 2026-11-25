import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = fileURLToPath(new URL('./normal-track.ts', import.meta.url));
const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
const invoke = (tmp: string, ...args: string[]) => Bun.spawnSync({
    cmd: [process.execPath, tool, ...args], env: { ...process.env, TMPDIR: tmp }, cwd: tmp,
});

async function fixture(check: (tmp: string, input: string, parameters: any) => Promise<void>) {
    const tmp = mkdtempSync(join(tmpdir(), 'normal-track-test-'));
    try {
        const sources = join(tmp, 'inputs');
        mkdirSync(sources);
        const asset = (name: string) => relative(sources, join(assets, `${name}.gltf`));
        const input = join(sources, 'parameters with spaces.json');
        const parameters = {
            path: { distances: [0, 6], positions: [[0, 1.5, 0], [0, 1.5, -6]], rotations: [[0, 0, 0, 1], [0, 0, 0, 1]] },
            profile: asset('assembly-section'), tie: asset('assembly-tie-bar'), separation: 2.4, spacing: 1,
            startOffset: .5, excluded: [{ start: 1.5, end: 3.5 }],
            custom: [{ asset: asset('assembly-fitting'), pose: { translation: [8, 9, 7], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }],
        };
        await check(tmp, input, parameters);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const near = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 6));
};

// Read emitted POSITION bytes directly, without the command's bounds parser.
function positions(doc: any, node: any): number[][] {
    const primitive = doc.meshes[node.mesh].primitives[0];
    const a = doc.accessors[primitive.attributes.POSITION], v = doc.bufferViews[a.bufferView];
    const bytes = Buffer.from(doc.buffers[v.buffer].uri.split(',')[1], 'base64');
    return Array.from({ length: a.count }, (_, i) => [0, 1, 2].map(j =>
        bytes.readFloatLE((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? 12) + 4 * j)));
}

test('explicit NormalTrack file exports the original phase, edited gauge and custom world pose', async () => {
    await fixture(async (tmp, input, parameters) => {
        await Bun.write(input, JSON.stringify(parameters));
        const run = invoke(tmp, relative(tmp, input));
        expect(run.stderr.toString()).toBe('');
        expect(run.exitCode).toBe(0);
        const report = JSON.parse(run.stdout.toString());
        expect(report.placementCount).toBe(7);
        expect(report.poses).toHaveLength(7);
        expect(report.poses.slice(2, -1).map((pose: any) => pose.translation)).toEqual(
            [[0, 1.5, -.5], [0, 1.5, -3.5], [0, 1.5, -4.5], [0, 1.5, -5.5]],
        );
        expect(dirname(dirname(report.gltfPath))).toBe(tmp);
        expect(statSync(dirname(report.gltfPath)).mode & 0o777).toBe(0o700);
        const doc = await Bun.file(report.gltfPath).json();
        expect(doc.buffers.every((b: any) => b.uri.startsWith('data:'))).toBe(true);
        const placements = doc.scenes[doc.scene].nodes.map((i: number) => doc.nodes[i]);
        expect(placements.map(({ translation, rotation }: any) => ({ translation, rotation }))).toEqual(report.poses);
        for (const [i, center] of [-1.2, 1.2].entries()) {
            const rail = doc.nodes[placements[i].children[0]];
            const x = positions(doc, rail).map(p => p[0]);
            near([Math.min(...x), Math.max(...x)], [center - .06, center + .06]);
            for (const primitive of doc.meshes[rail.mesh].primitives) {
                expect(doc.materials[primitive.material].pbrMetallicRoughness.baseColorFactor).toEqual([.06, .7, .78, 1]);
            }
        }
        const custom = placements.at(-1);
        near(custom.translation, [8, 9, 7]);
        near(custom.rotation, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
        expect(custom.children).toHaveLength(2);
        // The second fitting mesh supplies the unique positive world extrema after the 90° turn.
        const fitting = positions(doc, doc.nodes[custom.children[1]]).map(([x, y, z]) => [8 - y, 9 + x, 7 + z]);
        near([0, 1, 2].map(i => Math.max(...fitting.map(p => p[i]))), [8.13, 9.21, 7.2]);
        near(report.bounds.min, [-1.26, 1.32, -6]);
        near(report.bounds.max, [8.13, 9.21, 7.2]);
    });
});

test('far custom bounds retain the exported placement and nested native transforms', async () => {
    await fixture(async (tmp, input, parameters) => {
        const source = await Bun.file(join(assets, 'assembly-fitting.gltf')).json();
        const roots = source.scenes[source.scene].nodes;
        const child = source.nodes.push({ children: roots, translation: [.125, 0, 0], scale: [.5, 1, 1] }) - 1;
        source.scenes[source.scene].nodes = [source.nodes.push({
            children: [child], matrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, .5, 0, 0, 1],
        }) - 1];
        source.buffers[0].uri = relative(dirname(input), join(assets, source.buffers[0].uri));
        await Bun.write(join(dirname(input), 'nested.gltf'), JSON.stringify(source));
        const far = 2 ** 30 + .25;
        parameters.custom = [{ asset: 'nested.gltf', pose: { translation: [far, 9, 7], rotation: [0, 0, 0, 1] } }];
        await Bun.write(input, JSON.stringify(parameters));
        const run = invoke(tmp, input);
        expect(run.stderr.toString()).toBe('');
        expect(run.exitCode).toBe(0);
        const report = JSON.parse(run.stdout.toString());
        const doc = await Bun.file(report.gltfPath).json();
        const placement = doc.nodes[doc.scenes[doc.scene].nodes.at(-1)];
        expect(placement.translation).toEqual([far, 9, 7]);
        // x = far + .5 + 2 * (.125 + .5 * xLocal); the fitting reaches +.21 locally.
        near(report.bounds.max, [far + .96, 9.095, 7.2]);
    });
});

test('help locates the editable default, which works from another directory', async () => {
    await fixture(async tmp => {
        const help = invoke(tmp, '--help');
        expect(help.exitCode).toBe(0);
        expect(help.stdout.toString()).toContain('examples/normal-track.json');
        expect(readdirSync(tmp)).toEqual(['inputs']);
        const run = invoke(tmp);
        expect(run.exitCode).toBe(0);
        expect(await Bun.file(JSON.parse(run.stdout.toString()).gltfPath).exists()).toBe(true);
    });
});

test('invalid spacing and missing custom resource refuse without stdout or export', async () => {
    await fixture(async (tmp, input, parameters) => {
        for (const [invalid, diagnostic] of [
            [{ ...parameters, spacing: 0 }, 'repetition'],
            [{ ...parameters, custom: [{ ...parameters.custom[0], asset: 'missing.gltf' }] }, 'missing.gltf'],
        ] as const) {
            await Bun.write(input, JSON.stringify(invalid));
            const run = invoke(tmp, input);
            expect(run.exitCode).not.toBe(0);
            expect(run.stdout.toString()).toBe('');
            expect(run.stderr.toString()).toContain(diagnostic);
            expect(readdirSync(tmp)).toEqual(['inputs']);
            expect(readdirSync(dirname(input))).toEqual(['parameters with spaces.json']);
        }
    });
});
