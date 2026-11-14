import { expect, test } from 'bun:test';
import { ConstructionError, registry, type Document, type TypeDefinition, type Primitive } from '../../../construction/kernel';
const T = { id: 'test.resource@1' };
const source = (): Document => ({ schema: 'cc.graph@1', entry: 'outer', groups: [{ operation: 'outer', graph: { inputs: [], nodes: [], outputs: [] } }] });
const failures = [() => new RangeError('host allocation limit'), () => new ConstructionError('resource', ['stale'], 'old', 'oldPort', 'host allocation limit')];
function refused(run: () => unknown, path: string[], node: string, port: string | undefined, category = 'resource') {
    let published: unknown, caught: any;
    try { published = run(); } catch (e) { caught = e; }
    expect(published).toBeUndefined(); expect(caught).toBeInstanceOf(ConstructionError);
    expect(caught.category).toBe(category); expect(caught.path).toEqual(path); expect(caught.node).toBe(node); expect(caught.port).toBe(port);
    expect(caught.message).toContain('host allocation limit');
}
test('entry validator and default/literal decoder allocation refusals retain resource category and active port', () => {
    for (const failure of failures) {
        const type: TypeDefinition = { id: T.id, validate: () => { throw failure(); } };
        const d = source(); d.groups[0].graph.inputs = [{ name: 'x', type: T }];
        refused(() => registry([type], []).evaluate(d, { inputs: { x: { type: T, value: 0 } } }), ['outer'], 'entry', 'x');
        type.validate = v => v; type.decode = () => { throw failure(); };
        d.groups[0].graph.inputs[0].default = 0;
        refused(() => registry([type], []).evaluate(d, { inputs: {} }), ['outer'], 'entry', 'x');
        d.groups[0].graph.inputs = []; d.groups[0].graph.outputs = [{ name: 'result', type: T, binding: { value: 0 } }];
        refused(() => registry([type], []).evaluate(d, { inputs: {} }), ['outer'], 'entry', 'result');
    }
}, 1000);
test('primitive output validators recontextualize allocation refusals without publishing successful sibling outputs', () => {
    for (const failure of failures) {
        const type: TypeDefinition = { id: T.id, validate: v => { if (v === 2) throw failure(); return v; } };
        const op: Primitive = { operation: 'test.produce', inputs: [], outputs: [{ name: 'good', type: T }, { name: 'bad', type: T }], evaluate: () => ({ good: 1, bad: 2 }) };
        const d = source(); d.groups[0].graph.nodes = [{ id: 'produce', operation: op.operation, inputs: {} }];
        d.groups[0].graph.outputs = [{ name: 'result', type: T, binding: { node: 'produce', output: 'good' } }];
        refused(() => registry([type], [op]).evaluate(d, { inputs: {} }), ['outer', 'produce'], 'produce', 'bad');
    }
}, 1000);
test('nested group output validation allocation refusal identifies the active complete-call output', () => {
    for (const failure of failures) {
        let validations = 0;
        const type: TypeDefinition = { id: T.id, decode: v => v, validate: v => { if (++validations === 2) throw failure(); return v; } };
        const d = source();
        d.groups[0].graph.nodes = [{ id: 'call', operation: 'inner', inputs: {} }];
        d.groups[0].graph.outputs = [{ name: 'result', type: T, binding: { node: 'call', output: 'x' } }];
        d.groups.push({ operation: 'inner', graph: { inputs: [], nodes: [], outputs: [{ name: 'x', type: T, binding: { value: 0 } }] } });
        refused(() => registry([type], []).evaluate(d, { inputs: {} }), ['outer', 'call'], 'call', 'x');
    }
}, 1000);
test('primitive execution preserves explicit resource errors just like allocation RangeErrors; ordinary causes stay evaluation/type', () => {
    for (const failure of [...failures, () => new Error('host allocation limit')]) {
        const d = source(), type: TypeDefinition = { id: T.id, validate: v => v };
        const op: Primitive = { operation: 'test.produce', inputs: [], outputs: [{ name: 'x', type: T }], evaluate: () => { throw failure(); } };
        d.groups[0].graph.nodes = [{ id: 'produce', operation: op.operation, inputs: {} }];
        d.groups[0].graph.outputs = [{ name: 'result', type: T, binding: { node: 'produce', output: 'x' } }];
        const category = failure().constructor === Error ? 'evaluation' : 'resource';
        refused(() => registry([type], [op]).evaluate(d, { inputs: {} }), ['outer', 'produce'], 'produce', undefined, category);
    }
    const d = source(); d.groups[0].graph.inputs = [{ name: 'x', type: T }];
    refused(() => registry([{ id: T.id, validate: () => { throw Error('host allocation limit'); } }], []).evaluate(d, { inputs: { x: { type: T, value: 0 } } }), ['outer'], 'entry', 'x', 'type');
}, 1000);
