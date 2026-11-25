import { expect, test } from 'bun:test';
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Literal analytic expectations, independent of the policy's sampling helpers.
const expected = [[0, 0, .6], [0, 0, .2], [0, 0, -.2], [0, 0, -.6], [0, 0, -1]];
const round = (translation: number[]) => translation.map(x => Number(x.toFixed(12)));
test('documented invocations own output and preserve unrelated symlink targets', async () => {
    const root = new URL('../', import.meta.url).pathname;
    const temp = mkdtempSync(join(tmpdir(), 'coasters-example-test-'));
    try {
        // Reproduce the shared-name boundary inside storage owned by this test only.
        const sentinel = join(temp, 'control');
        const shared = join(temp, 'repeated-ties.gltf');
        writeFileSync(sentinel, 'unrelated content');
        symlinkSync(sentinel, shared);
        const input = join(temp, 'part.gltf');
        // Test-owned metres, geometry and native material; not a packaged asset.
        const fixture = {
            asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0, translation: [3, 4, 5] }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
            materials: [{ name: 'test-owned', pbrMetallicRoughness: { metallicFactor: 0.25 } }],
            buffers: [{ uri: 'part.bin', byteLength: 36 }],
            bufferViews: [{ buffer: 0, byteLength: 36 }],
            accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
        };
        writeFileSync(input, JSON.stringify(fixture));
        writeFileSync(join(temp, 'part.bin'), new Uint8Array(new Float32Array([1,2,3, 2,2,3, 1,4,3]).buffer));
        const outputs = new Set<string>();
        for (const args of [[], [input]]) {
            const child = Bun.spawn([process.execPath, 'examples/repeated-tie.ts', ...args], {
                cwd: root, env: { ...process.env, TMPDIR: temp }, stdout: 'pipe', stderr: 'pipe',
            });
            const [stdout, stderr] = await Promise.all([
                new Response(child.stdout).text(), new Response(child.stderr).text(),
            ]);
            expect(await child.exited).toBe(0);
            expect(JSON.parse(stdout).map((frame: { translation: number[] }) => ({ ...frame, translation: round(frame.translation) }))).toEqual(expected.map(translation => ({ translation, rotation: [0, 0, 0, 1] })));
            expect(stderr).toMatch(/^Wrote .+\n$/);
            const output = stderr.slice('Wrote '.length).trimEnd();
            expect(dirname(dirname(output))).toBe(temp);
            expect(lstatSync(dirname(output)).mode & 0o777).toBe(0o700);
            expect(outputs.has(output)).toBe(false);
            outputs.add(output);
            const native = await Bun.file(output).json();
            const roots = native.scenes[native.scene].nodes;
            expect(roots).toHaveLength(5);
            expect(roots.map((i: number) => round(native.nodes[i].translation))).toEqual(expected);
            expect(native.buffers.every((b: { uri: string }) => b.uri.startsWith('data:'))).toBe(true);
            expect(native.meshes).toHaveLength(1);
            if (args.length) {
                expect(native.materials).toEqual(fixture.materials);
                expect(roots.map((i: number) => native.nodes[native.nodes[i].children[0]].translation)).toEqual(Array(5).fill([3,4,5]));
            }
            expect(readFileSync(sentinel, 'utf8')).toBe('unrelated content');
            expect(lstatSync(shared).isSymbolicLink()).toBe(true);
        }
        fixture.meshes[0].primitives[0].material = 9;
        writeFileSync(input, JSON.stringify(fixture));
        const corrupt = Bun.spawnSync([process.execPath, 'examples/repeated-tie.ts', input], {
            cwd: root, env: { ...process.env, TMPDIR: temp },
        });
        expect(corrupt.exitCode).not.toBe(0);
        expect(corrupt.stderr.toString()).toContain('material');
        const missing = join(temp, 'missing-input.gltf');
        const bad = Bun.spawn([process.execPath, 'examples/repeated-tie.ts', missing], {
            cwd: root, env: { ...process.env, TMPDIR: temp }, stdout: 'pipe', stderr: 'pipe',
        });
        const diagnostic = await new Response(bad.stderr).text();
        expect(await bad.exited).not.toBe(0);
        expect(diagnostic).toContain('ENOENT');
        expect(diagnostic).toContain(missing);
        expect(await new Response(bad.stdout).text()).toBe('');
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
});
