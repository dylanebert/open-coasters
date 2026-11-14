import { TIMEOUT } from "@dylanebert/shallot/testing";
import { expect, test } from 'bun:test';
import { ConstructionError, parseDocument, registry, validateDocument, type Document, type Primitive, type Type } from '../../../construction/kernel';
import { ids, nominal, list, standardOperations, standardTypes, standardRegistry } from '../../../construction/geometry';
const tiesDocument = parseDocument(await Bun.file(new URL('../../../construction/ties.json', import.meta.url)).text());
const N = nominal(ids.number), LL = list(list(N));
const reg = standardRegistry();
function doc(type: Type = N, binding: any = { value: 1 }): Document {
    return { schema: 'cc.graph@1', entry: 'G', groups: [{ operation: 'G', graph: { inputs: [], nodes: [], outputs: [{ name: 'out', type, binding }] } }] };
}
const copy = <T>(x: T): T => structuredClone(x);
function failure(run: () => unknown, category: string, cause: string) {
    let e: any; try { run(); } catch (error) { e = error; }
    expect(e).toBeInstanceOf(ConstructionError); expect(e.category).toBe(category); expect(e.message).toContain(cause);
    return e as ConstructionError;
}
const evaluate = (d: Document, inputs: any = {}) => reg.evaluate(d, { inputs });

test('original JSON parsing rejects duplicate keys, closed variants and nonfinite JSON', () => {
    expect(parseDocument(JSON.stringify(tiesDocument))).toEqual(tiesDocument);
    for (const source of ['{"schema":"cc.graph@1","schema":"cc.graph@1"}', '{"x":{"a":0,"\\u0061":1}}', '{"x":1e999}', '[1,]', '{} false']) failure(() => parseDocument(source), 'structure', '');
    for (const change of [
        (d: any) => d.extra = 0,
        (d: any) => d.groups[0].extra = 0,
        (d: any) => d.groups[0].graph.outputs[0].extra = 0,
        (d: any) => d.groups[0].graph.outputs[0].binding = { value: 1, input: 'x' },
        (d: any) => d.groups[0].graph.outputs[0].type = { id: ids.number, list: N },
        (d: any) => d.groups[0].graph.outputs[0].binding = { list: {} },
    ]) { const d = doc(); change(d); failure(() => evaluate(d), 'structure', ''); }
}, TIMEOUT.cheap);

test('whole-document structural failures do not disappear with dead definitions', () => {
    const mutations: [string, (d: any) => void][] = [
        ['duplicate group', d => d.groups.push(copy(d.groups[0]))],
        ['duplicate port', d => d.groups[0].graph.outputs.push(copy(d.groups[0].graph.outputs[0]))],
        ['invalid entry', d => d.entry = 'absent'],
        ['duplicate node', d => d.groups[0].graph.nodes = [{ id: 'n', operation: 'missing', inputs: {} }, { id: 'n', operation: 'missing', inputs: {} }]],
        ['dangling input', d => d.groups[0].graph.nodes = [{ id: 'n', operation: 'missing', inputs: { x: { input: 'absent' } } }]],
        ['dangling node', d => d.groups[0].graph.nodes = [{ id: 'n', operation: 'missing', inputs: { x: { node: 'absent', output: 'x' } } }]],
        ['dependency cycle', d => d.groups[0].graph.nodes = [{ id: 'n', operation: 'missing', inputs: { x: { node: 'n', output: 'x' } } }]],
        ['group recursion', d => d.groups[0].graph.nodes = [{ id: 'n', operation: 'G', inputs: {} }]],
        ['dangling local output', d => { d.groups.push({ operation: 'H', graph: { inputs: [], nodes: [], outputs: [] } }); d.groups[0].graph.nodes = [{ id: 'n', operation: 'H', inputs: { x: { node: 'n', output: 'absent' } } }]; }],
    ];
    for (const [cause, change] of mutations) { const d = doc(); change(d); failure(() => evaluate(d), 'structure', cause); }
    const d = doc();
    d.groups[0].graph.nodes.push({ id: 'unused', operation: 'not.installed', inputs: { x: { value: 'not a number' } } });
    d.groups.push({ operation: 'dead', graph: { inputs: [{ name: 'badDefault', type: nominal('not.installed'), default: null }], nodes: [], outputs: [{ name: 'unknown', type: nominal('not.installed'), binding: { value: null } }] } });
    expect(evaluate(d)).toEqual({ out: 1 });
    failure(() => evaluate(doc(nominal('not.installed'))), 'unsupported', 'type not.installed');
}, TIMEOUT.cheap);

test('defaults and invocation values are exact, every entry input is required or decoded', () => {
    const d = doc(); d.groups[0].graph.inputs = [{ name: 'unused', type: N }];
    failure(() => evaluate(d), 'input', 'missing required');
    failure(() => evaluate(d, { unused: { type: list(N), value: [1] } }), 'type', 'connection type');
    failure(() => evaluate(d, { unused: { type: N, value: '1' } }), 'type', 'finite number');
    failure(() => evaluate(d, { unused: { type: N, value: 1 }, extra: { type: N, value: 2 } }), 'input', 'unknown input');
    d.groups[0].graph.inputs[0].default = 'wrong'; failure(() => evaluate(d), 'type', 'finite number');
    d.groups[0].graph.inputs[0].default = 3; expect(evaluate(d)).toEqual({ out: 1 });
    const resource = doc(nominal(ids.content), { value: {} }); failure(() => evaluate(resource), 'type', 'no literal decoder');
    d.groups[0].graph.inputs[0].type = list(nominal('missing'));
    d.groups[0].graph.inputs[0].default = []; failure(() => evaluate(d), 'unsupported', 'type missing');
}, TIMEOUT.cheap);

test('recursive lists and nested groups bind complete calls, preserving duplicates and order', () => {
    const d = doc(LL, { list: [{ list: [{ value: 2 }, { value: 2 }] }, { list: [] }] });
    expect(evaluate(d)).toEqual({ out: [[2, 2], []] });
    d.groups[0].graph.outputs[0].binding = { list: [{ value: 2 }] };
    failure(() => evaluate(d), 'type', 'expected list');
    failure(() => evaluate(doc(N, { list: [] })), 'type', 'list assembly');
    const nested = doc(LL, { node: 'call', output: 'out' });
    nested.groups[0].graph.inputs = [{ name: 'source', type: LL }];
    nested.groups[0].graph.nodes = [{ id: 'call', operation: 'H', inputs: { x: { input: 'source' } } }];
    nested.groups.push({ operation: 'H', graph: { inputs: [{ name: 'x', type: LL }, { name: 'unused', type: N }], nodes: [], outputs: [{ name: 'out', type: LL, binding: { input: 'x' } }, { name: 'unconsumed', type: N, binding: { value: 'bad' } }] } });
    const inputs = { source: { type: LL, value: [[1], [2, 2]] } };
    failure(() => evaluate(nested, inputs), 'input', 'missing required');
    nested.groups[0].graph.nodes[0].inputs.unused = { value: 3 };
    const e = failure(() => evaluate(nested, inputs), 'type', 'finite number'); expect(e.port).toBe('unconsumed'); expect(e.path).toEqual(['G', 'call']);
    nested.groups[1].graph.outputs[1].binding = { value: 4 };
    expect(evaluate(nested, inputs).out).toEqual([[1], [2, 2]]);
    nested.groups[0].graph.nodes[0].inputs.x = { list: [{ list: [{ value: 9 }] }, { list: [{ value: 8 }, { value: 8 }] }] };
    expect(evaluate(nested, inputs).out).toEqual([[9], [8, 8]]);
    nested.groups[0].graph.inputs[0].type = list(N);
    failure(() => evaluate(nested, inputs), 'type', 'connection type');
}, TIMEOUT.cheap);

test('all demanded primitive inputs/outputs checked; unknown output and atomic failures have context', () => {
    const operation: Primitive = { operation: 'custom', inputs: [{ name: 'unused', type: N }], outputs: [{ name: 'a', type: N }, { name: 'b', type: N }], evaluate: () => ({ a: 1, b: 'wrong' }) };
    const d = doc(N, { node: 'call', output: 'a' }); d.groups[0].graph.nodes = [{ id: 'call', operation: 'custom', inputs: {} }];
    const r = registry(standardTypes, [operation]);
    failure(() => r.evaluate(d, { inputs: {} }), 'input', 'missing required');
    d.groups[0].graph.nodes[0].inputs.unused = { value: 1 };
    expect(failure(() => r.evaluate(d, { inputs: {} }), 'type', 'finite number').port).toBe('b');
    operation.evaluate = () => ({ a: 1, b: 2 }); // Existing registry captured the old executable identity.
    failure(() => r.evaluate(d, { inputs: {} }), 'type', 'finite number');
    expect(registry(standardTypes, [operation]).evaluate(d, { inputs: {} }).out).toBe(1);
    operation.evaluate = () => ({ a: 1 });
    failure(() => registry(standardTypes, [operation]).evaluate(d, { inputs: {} }), 'evaluation', 'missing output');
    operation.evaluate = () => { throw Error('boom'); };
    let published: unknown = 'not published';
    failure(() => { published = registry(standardTypes, [operation]).evaluate(d, { inputs: {} }); }, 'evaluation', 'boom'); expect(published).toBe('not published');
    operation.evaluate = () => { throw new RangeError('host budget'); };
    failure(() => registry(standardTypes, [operation]).evaluate(d, { inputs: {} }), 'resource', 'host budget');
    d.groups[0].graph.outputs[0].binding = { node: 'call', output: 'absent' };
    failure(() => registry(standardTypes, [operation]).evaluate(d, { inputs: {} }), 'type', 'unknown output');
    d.groups[0].graph.nodes[0].operation = 'missing'; failure(() => evaluate(d), 'unsupported', 'operation missing');
}, TIMEOUT.cheap);

test('published Ties JSON signatures independently typewalk against explicit expected signatures', () => {
    const signatures: Record<string, [Record<string, string>, Record<string, string>]> = {
        'cc.fullSpan@1': [{ length: 'N' }, { spans: 'LS' }],
        'cc.railOffsets@1': [{ separation: 'N' }, { left: 'F', right: 'F' }],
        'cc.pathStations@1': [{ path: 'P' }, { length: 'N', frames: 'LF' }],
        'cc.fixedDistances@1': [{ length: 'N', spacing: 'N', phase: 'N', allowed: 'LS', excluded: 'LS' }, { distances: 'LN' }],
        'cc.framesAt@1': [{ path: 'P', distances: 'LN' }, { frames: 'LF' }],
        'cc.adjustFrames@1': [{ frames: 'LF', localFrame: 'F' }, { frames: 'LF' }],
        'cc.instance@1': [{ content: 'C', frames: 'LF' }, { construction: 'R' }],
        'cc.join@1': [{ constructions: 'LR' }, { construction: 'R' }],
    };
    const names: Record<string, string> = { 'cc.number@1': 'N', 'cc.frame@1': 'F', 'cc.span@1': 'S', 'cc.sampled-frame-path@1': 'P', 'cc.content@1': 'C', 'cc.construction@1': 'R' };
    const spelling = (t: Type): string => 'id' in t ? names[t.id]! : 'L' + spelling(t.list);
    for (const op of standardOperations) expect([Object.fromEntries(op.inputs.map(p => [p.name, spelling(p.type)])), Object.fromEntries(op.outputs.map(p => [p.name, spelling(p.type)]))]).toEqual(signatures[op.operation]);
    const g = tiesDocument.groups[0].graph, wires = Object.fromEntries(g.inputs.map(p => [p.name, spelling(p.type)]));
    expect(wires).toEqual({ path: 'P', content: 'C', spacing: 'N', phase: 'N', allowed: 'LS', excluded: 'LS', localFrame: 'F' });
    expect(g.inputs.filter(p => 'default' in p).map(p => [p.name, p.default])).toEqual([['spacing', 1], ['phase', 0], ['excluded', []], ['localFrame', { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }]]);
    const output = (b: any): string => 'input' in b ? wires[b.input] : signatures[g.nodes.find(n => n.id === b.node)!.operation][1][b.output];
    for (const n of g.nodes) {
        const expected = signatures[n.operation][0]; expect(Object.keys(n.inputs).sort()).toEqual(Object.keys(expected).sort());
        for (const [name, binding] of Object.entries(n.inputs)) expect(output(binding)).toBe(expected[name]);
    }
    expect(g.outputs.map(p => [p.name, spelling(p.type), output(p.binding)])).toEqual([['construction', 'R', 'R']]);
    validateDocument(tiesDocument);
}, TIMEOUT.cheap);
