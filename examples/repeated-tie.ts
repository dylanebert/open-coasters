import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentValue, nativeSnapshot, resolvedNative } from '../construction/native';
import { defaultSpacing, placeTies } from './repeated-tie-recipe';

// Run from the repository root. An optional argument substitutes your exported part.
const asset = new URL('../demo/public/assets/blitz-tie.gltf', import.meta.url);
const input = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`) : asset;
const document = await Bun.file(input).json();
const buffers = await Promise.all(document.buffers.map(async (buffer: { uri: string }) => {
    const url = new URL(buffer.uri, input);
    return url.protocol === 'data:' ? await (await fetch(url)).arrayBuffer() : await Bun.file(url).arrayBuffer();
}));
const content = contentValue({ snapshot: nativeSnapshot(document, buffers) });
const result = placeTies(content, defaultSpacing);
console.log(JSON.stringify(result.placements.map(p => p.frame)));
const output = join(mkdtempSync(join(tmpdir(), 'open-coasters-ties-')), 'repeated-ties.gltf');
writeFileSync(output, JSON.stringify(resolvedNative(result)), { flag: 'wx' });
console.error(`Wrote ${output}`);
