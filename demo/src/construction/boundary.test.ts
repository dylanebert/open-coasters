import { TIMEOUT } from "@dylanebert/shallot/testing";
import { expect, test } from 'bun:test';
import { ConstructionError, registry, immutable, type Document, type Primitive } from '../../../construction/kernel';
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
}, TIMEOUT.cheap);

test('shallow caller freezing cannot impersonate deeply owned immutable runtime data', () => {
    const T=nominal('test.nested'), child={number:1}, source=Object.freeze({child});
    const r=registry([{id:'test.nested',validate:(v:any)=>v}],[]);
    const doc:Document={schema:'cc.graph@1',entry:'entry',groups:[{operation:'entry',graph:{inputs:[{name:'data',type:T}],nodes:[],outputs:[{name:'data',type:T,binding:{input:'data'}}]}}]};
    const result=r.evaluate(doc,{inputs:{data:{type:T,value:source}}}).data as typeof source;
    child.number=9; expect(result.child.number).toBe(1); expect(Object.isFrozen(child)).toBe(false);
    expect(()=>result.child.number=2).toThrow();
    expect(()=>r.evaluate(doc,{inputs:{data:{type:T,value:immutable({bytes:new ArrayBuffer(4)})}}})).toThrow('runtime values must be immutable resources or plain data');
}, TIMEOUT.cheap);

test('accessors, hidden properties and host state cannot impersonate owned plain trees', () => {
    const T=nominal('test.box');
    const doc:Document={schema:'cc.graph@1',entry:'entry',groups:[{operation:'entry',graph:{inputs:[{name:'box',type:T}],nodes:[{id:'mutate',operation:'test.mutate',inputs:{box:{input:'box'}}}],outputs:[{name:'box',type:T,binding:{node:'mutate',output:'box'}}]}}]};
    let calls=0;
    const r=registry([{id:'test.box',validate:v=>v}],[{operation:'test.mutate',inputs:[{name:'box',type:T}],outputs:[{name:'box',type:T}],evaluate(v){calls++;(v.box as any).values[0]=9;return {box:v.box};}}]);
    let source=[1], reads=0;
    const getter=immutable({get values(){reads++;return source;}});
    expect(reads).toBe(0);source=[2];
    expect(()=>r.evaluate(doc,{inputs:{box:{type:T,value:getter}}})).toThrow('own enumerable data properties required');
    expect(reads).toBe(0);expect(source).toEqual([2]);expect(calls).toBe(0);
    const hidden=[3], date=new Date(0), symbol=Symbol('state');
    const cases=[
        Object.defineProperty({values:[2]},'hidden',{value:hidden}),
        Object.defineProperty({values:[2]},'host',{value:date}),
        Object.defineProperty({values:[2]},'getter',{get:()=>hidden}),
        {values:[2],[symbol]:hidden},
        {values:[2],host:date},
        {values:[2],callback:()=>hidden},
    ];
    for(const box of cases) expect(()=>r.evaluate(doc,{inputs:{box:{type:T,value:immutable(box)}}})).toThrow('plain data');
    expect(hidden).toEqual([3]);expect(Object.isFrozen(hidden)).toBe(false);
    date.setTime(10);expect(date.getTime()).toBe(10);expect(calls).toBe(0);
});

test('proven ordinary data trees retain reference identity across complete calls', () => {
    const T=nominal('test.tree'), tree=immutable({values:[1,2],nested:{flag:true}});
    const r=registry([{id:'test.tree',validate:v=>v}],[{operation:'test.identity',inputs:[{name:'tree',type:T}],outputs:[{name:'tree',type:T}],evaluate(v){expect(v.tree).toBe(tree);expect(()=>(v.tree as typeof tree).values[0]=9).toThrow();return {tree:v.tree};}}]);
    const doc:Document={schema:'cc.graph@1',entry:'entry',groups:[{operation:'entry',graph:{inputs:[{name:'tree',type:T}],nodes:[{id:'identity',operation:'test.identity',inputs:{tree:{input:'tree'}}}],outputs:[{name:'tree',type:T,binding:{node:'identity',output:'tree'}}]}}]};
    for(let i=0;i<3;i++) {
        const result=r.evaluate(doc,{inputs:{tree:{type:T,value:tree}}}).tree as typeof tree;
        expect(result).toBe(tree);expect(result.values).toBe(tree.values);expect(result.nested).toBe(tree.nested);
    }
});

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
}, TIMEOUT.cheap);

test('primitive signature copies and type validators are captured at registry creation', () => {
    const op = primitive(v => ({ data: v.data }));
    const types = standardTypes.map(t => ({ ...t }));
    const r = registry(types, [op]);
    op.inputs[0].type = N; op.outputs[0].name = 'changed'; types.find(t => t.id === ids.number)!.validate = () => 'changed';
    expect(r.evaluate(document(), { inputs: { data: { type: LN, value: [1, 2] } } }).data).toEqual([1, 2]);
}, TIMEOUT.cheap);

test('list wires have exact recursive types, nominal IDs never structurally coerce', () => {
    const d = document(), invoke = () => registry(standardTypes, [primitive(v => ({ data: v.data }))]).evaluate(d, { inputs: { data: { type: LN, value: [1] } } });
    d.groups[1].graph.nodes[0].inputs.data = { list: [{ input: 'data' }] };
    error(invoke, 'type', 'list element type');
    d.groups[1].graph.nodes[0].inputs.data = { value: [1, '2'] }; error(invoke, 'type', 'finite number');
    d.groups[1].graph.nodes[0].inputs.data = { value: [[1]] }; error(invoke, 'type', 'finite number');
    d.groups[1].graph.nodes[0].inputs.data = { input: 'data' }; d.groups[1].graph.outputs[0].type = list(nominal(ids.span));
    error(invoke, 'type', 'output type mismatch');
}, TIMEOUT.cheap);
