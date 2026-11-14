import { expect, test } from 'bun:test';
import { ConstructionError, registry, type Document, type Primitive } from '../../../construction/kernel';
import { ids, list, nominal, standardTypes } from '../../../construction/geometry';
const N = nominal(ids.number), LN = list(N);
const document = (): Document => ({ schema: 'cc.graph@1', entry: 'outer', groups: [
    { operation: 'outer', graph: { inputs: [{ name: 'data', type: LN }], nodes: [{ id: 'inner', operation: 'inner', inputs: { data: { input: 'data' } } }], outputs: [{ name: 'data', type: LN, binding: { node: 'inner', output: 'data' } }] } },
    { operation: 'inner', graph: { inputs: [{ name: 'data', type: LN }], nodes: [{ id: 'call', operation: 'test.copy', inputs: { data: { input: 'data' } } }], outputs: [{ name: 'data', type: LN, binding: { node: 'call', output: 'data' } }] } },
] });
const primitive = (evaluate: Primitive['evaluate']): Primitive => ({ operation: 'test.copy', inputs: [{ name: 'data', type: LN }], outputs: [{ name: 'data', type: LN }], evaluate });
function error(run: () => unknown, category: string, cause: string) {
    let caught: any; try { run(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ConstructionError); expect(caught.category).toBe(category); expect(caught.message).toContain(cause); return caught;
}

test('mutation refusal protects invocation values and outputs through two group boundaries', () => {
    const source = [1, 2, 2]; let attempted = false;
    const r = registry(standardTypes, [primitive(v => {
        expect(Object.isFrozen(v)).toBe(true); expect(Object.isFrozen(v.data)).toBe(true);
        expect(() => (v.data as number[])[0] = 99).toThrow(); attempted = true;
        return { data: v.data };
    })]);
    const result = r.evaluate(document(), { inputs: { data: { type: LN, value: source } } });
    expect(attempted).toBe(true); expect(source).toEqual([1, 2, 2]); expect(Object.isFrozen(source)).toBe(false);
    expect(result.data).toEqual(source); expect(() => (result.data as number[]).push(3)).toThrow();
    expect(() => (result as any).extra = 3).toThrow(); source[0] = 5; expect(result.data).toEqual([1, 2, 2]);
}, 1000);

test('nested complete-call validation demands unused inputs and every output including unsupported types', () => {
    const op = primitive(v => ({ data: v.data })), d = document();
    d.groups[1].graph.inputs.push({ name: 'required', type: N });
    const r = registry(standardTypes, [op]);
    const invoke = () => r.evaluate(d, { inputs: { data: { type: LN, value: [2] } } });
    expect(error(invoke, 'input', 'missing required').path).toEqual(['outer', 'inner']);
    d.groups[0].graph.nodes[0].inputs.required = { value: 'wrong' };
    expect(error(invoke, 'type', 'finite number').port).toBe('required');
    d.groups[0].graph.nodes[0].inputs.required = { value: 3 };
    d.groups[1].graph.outputs.push({ name: 'unused', type: nominal('not.installed'), binding: { value: 0 } });
    expect(error(invoke, 'unsupported', 'type not.installed').port).toBe('unused');
    d.groups[1].graph.outputs[1].type = N; d.groups[1].graph.outputs[1].binding = { value: 0 };
    expect(invoke().data).toEqual([2]);
    d.groups[0].graph.nodes[0].inputs.unknown = { value: 1 }; error(invoke, 'input', 'unknown input');
}, 1000);

test('primitive signature copies and type validators are captured at registry creation', () => {
    const op = primitive(v => ({ data: v.data }));
    const types = standardTypes.map(t => ({ ...t }));
    const r = registry(types, [op]);
    op.inputs[0].type = N; op.outputs[0].name = 'changed'; types.find(t => t.id === ids.number)!.validate = () => 'changed';
    expect(r.evaluate(document(), { inputs: { data: { type: LN, value: [1, 2] } } }).data).toEqual([1, 2]);
}, 1000);

test('list wires have exact recursive types, nominal IDs never structurally coerce', () => {
    const d = document(), invoke = () => registry(standardTypes, [primitive(v => ({ data: v.data }))]).evaluate(d, { inputs: { data: { type: LN, value: [1] } } });
    d.groups[1].graph.nodes[0].inputs.data = { list: [{ input: 'data' }] };
    error(invoke, 'type', 'list element type');
    d.groups[1].graph.nodes[0].inputs.data = { value: [1, '2'] }; error(invoke, 'type', 'finite number');
    d.groups[1].graph.nodes[0].inputs.data = { value: [[1]] }; error(invoke, 'type', 'finite number');
    d.groups[1].graph.nodes[0].inputs.data = { input: 'data' }; d.groups[1].graph.outputs[0].type = list(nominal(ids.span));
    error(invoke, 'type', 'output type mismatch');
}, 1000);
