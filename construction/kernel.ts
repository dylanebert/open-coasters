/** Domain-independent materialized dataflow. Documents contain data, never functions. */
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type Type = { id: string } | { list: Type };
export type Binding = { value: JSONValue } | { input: string } | { node: string; output: string } | { list: Binding[] };
export type InputPort = { name: string; type: Type; default?: JSONValue };
export type OutputPort = { name: string; type: Type; binding: Binding };
export type Graph = { inputs: InputPort[]; nodes: { id: string; operation: string; inputs: Record<string, Binding> }[]; outputs: OutputPort[] };
export type Document = { schema: 'cc.graph@1'; groups: { operation: string; graph: Graph }[]; entry: string };
export type Signature = { operation: string; inputs: InputPort[]; outputs: { name: string; type: Type }[] };
export type Category = 'structure' | 'unsupported' | 'type' | 'input' | 'evaluation' | 'resource';
export class ConstructionError extends Error {
    constructor(public category: Category, public path: readonly string[], public node: string, public port: string | undefined, cause: string) {
        super(`${category}: ${path.join('/')} ${node}${port ? '.' + port : ''}: ${cause}`);
    }
}
export function immutable<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const v of Object.values(value)) immutable(v);
        Object.freeze(value);
    }
    return value;
}
/** Copy caller-owned mutable data before a registered validator or operation sees it. */
function owned(value: any): any {
    if (!value || typeof value !== 'object') return value;
    if (!Array.isArray(value) && !record(value)) throw Error('runtime values must be immutable resources or plain data');
    const entries = Object.entries(value).map(([k, v]) => [k, owned(v)] as const);
    if (Object.isFrozen(value) && entries.every(([k, v]) => (value as any)[k] === v)) return value;
    return Array.isArray(value) ? entries.map(([, v]) => v) : Object.fromEntries(entries);
}
const own = (v: object, k: string) => Object.hasOwn(v, k);
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const name = (v: unknown) => typeof v === 'string' && v.length > 0;
function structure(cause: string): never { throw new ConstructionError('structure', [], 'document', undefined, cause); }
function keys(v: unknown, required: string[], optional: string[] = []): asserts v is Record<string, any> {
    if (!record(v) || required.some(k => !own(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) structure('malformed record / unknown member');
}
function typeShape(t: unknown): asserts t is Type {
    if (!record(t)) structure('malformed type');
    if (own(t, 'id')) { keys(t, ['id']); if (!name(t.id)) structure('invalid type ID'); }
    else { keys(t, ['list']); typeShape(t.list); }
}
function json(v: unknown): void {
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (Array.isArray(v)) { v.forEach(json); return; }
    if (record(v)) { Object.values(v).forEach(json); return; }
    structure('not finite JSON');
}
function bindingShape(b: unknown): asserts b is Binding {
    if (!record(b)) structure('malformed binding');
    if (own(b, 'value')) { keys(b, ['value']); json(b.value); }
    else if (own(b, 'input')) { keys(b, ['input']); if (!name(b.input)) structure('invalid input reference'); }
    else if (own(b, 'node')) { keys(b, ['node', 'output']); if (!name(b.node) || !name(b.output)) structure('invalid node reference'); }
    else { keys(b, ['list']); if (!Array.isArray(b.list)) structure('malformed list binding'); b.list.forEach(bindingShape); }
}
function unique(values: string[], cause: string) { if (new Set(values).size !== values.length) structure(cause); }
function ports(ps: unknown, output: boolean) {
    if (!Array.isArray(ps)) structure('ports must be arrays');
    for (const p of ps) {
        keys(p, output ? ['name', 'type', 'binding'] : ['name', 'type'], output ? [] : ['default']);
        if (!name(p.name)) structure('invalid port name');
        typeShape(p.type);
        if (output) bindingShape(p.binding); else if (own(p, 'default')) json(p.default);
    }
    unique(ps.map(p => p.name), 'duplicate port');
}
function acyclic(ids: string[], edges: (id: string) => string[], cause: string) {
    const active = new Set<string>(), done = new Set<string>();
    const visit = (id: string) => {
        if (active.has(id)) structure(cause);
        if (done.has(id)) return;
        active.add(id); edges(id).forEach(visit); active.delete(id); done.add(id);
    };
    ids.forEach(visit);
}
function walk(b: Binding, f: (b: Exclude<Binding, { list: Binding[] }>) => void) { if ('list' in b) b.list.forEach(x => walk(x, f)); else f(b); }
export function validateDocument(value: unknown): asserts value is Document {
    keys(value, ['schema', 'groups', 'entry']);
    if (value.schema !== 'cc.graph@1' || !Array.isArray(value.groups) || !name(value.entry)) structure('invalid document');
    for (const g of value.groups) {
        keys(g, ['operation', 'graph']); if (!name(g.operation)) structure('invalid group ID');
        keys(g.graph, ['inputs', 'nodes', 'outputs']); ports(g.graph.inputs, false); ports(g.graph.outputs, true);
        if (!Array.isArray(g.graph.nodes)) structure('nodes must be array');
        for (const n of g.graph.nodes) {
            keys(n, ['id', 'operation', 'inputs']);
            if (!name(n.id) || !name(n.operation) || !record(n.inputs) || Object.keys(n.inputs).some(k => !name(k))) structure('invalid node');
            Object.values(n.inputs).forEach(bindingShape);
        }
        unique(g.graph.nodes.map((n: any) => n.id), 'duplicate node ID');
    }
    unique(value.groups.map((g: any) => g.operation), 'duplicate group ID');
    const groups = new Map<string, { operation: string; graph: Graph }>(value.groups.map((g: any) => [g.operation, g]));
    if (!groups.has(value.entry)) structure('invalid entry ID');
    for (const { graph } of groups.values()) {
        const nodes = new Map(graph.nodes.map(n => [n.id, n]));
        const inspect = (b: Binding) => walk(b, r => {
            if ('input' in r && !graph.inputs.some(p => p.name === r.input)) structure('dangling input reference');
            if ('node' in r) {
                const n = nodes.get(r.node); if (!n) structure('dangling node reference');
                const local = groups.get(n.operation);
                if (local && !local.graph.outputs.some(p => p.name === r.output)) structure('dangling local output reference');
            }
        });
        graph.nodes.forEach(n => Object.values(n.inputs).forEach(inspect)); graph.outputs.forEach(p => inspect(p.binding));
        acyclic([...nodes.keys()], id => {
            const dependencies: string[] = [];
            Object.values(nodes.get(id)!.inputs).forEach(b => walk(b, r => { if ('node' in r) dependencies.push(r.node); }));
            return dependencies;
        }, 'node dependency cycle');
    }
    acyclic([...groups.keys()], id => groups.get(id)!.graph.nodes.map(n => n.operation).filter(op => groups.has(op)), 'local group recursion');
}
/** Recursive descent retains keys before constructing objects, so duplicates cannot disappear. */
export function parseDocument(source: string): Document {
    let i = 0;
    const ws = () => { while (/[ \t\r\n]/.test(source[i] ?? '') && i < source.length) i++; };
    const string = (): string => {
        const start = i++;
        while (i < source.length) { const c = source[i++]; if (c === '\\') i++; else if (c === '"') { try { return JSON.parse(source.slice(start, i)); } catch { structure('invalid JSON string'); } } }
        return structure('unterminated JSON string');
    };
    const value = (): any => {
        ws(); const c = source[i];
        if (c === '"') return string();
        if (c === '{') {
            i++; ws(); const out = Object.create(null), seen = new Set<string>();
            if (source[i] === '}') { i++; return out; }
            for (;;) {
                ws(); if (source[i] !== '"') structure('expected JSON key');
                const k = string(); if (seen.has(k)) structure('duplicate JSON key'); seen.add(k);
                ws(); if (source[i++] !== ':') structure('expected colon'); out[k] = value(); ws();
                const end = source[i++]; if (end === '}') return out; if (end !== ',') structure('expected comma');
            }
        }
        if (c === '[') {
            i++; ws(); const out: any[] = []; if (source[i] === ']') { i++; return out; }
            for (;;) { out.push(value()); ws(); const end = source[i++]; if (end === ']') return out; if (end !== ',') structure('expected comma'); }
        }
        const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
        if (!token) structure('invalid JSON token'); i += token[0].length;
        const out = JSON.parse(token[0]); if (typeof out === 'number' && !Number.isFinite(out)) structure('nonfinite JSON'); return out;
    };
    const out = value(); ws(); if (i !== source.length) structure('trailing JSON'); validateDocument(out); return immutable(out);
}
export type TypeDefinition = { id: string; validate: (value: unknown) => unknown; decode?: (value: JSONValue) => unknown };
export type Primitive = Signature & { evaluate: (inputs: Readonly<Record<string, unknown>>) => Record<string, unknown> };
export type TypedRuntimeValue = { type: Type; value: unknown };
const equal = (a: Type, b: Type): boolean => 'id' in a ? 'id' in b && a.id === b.id : 'list' in b && equal(a.list, b.list);
/** Copies descriptors and captures function identities; later registry edits cannot affect an invocation. */
export function registry(types: readonly TypeDefinition[], operations: readonly Primitive[]) {
    unique(types.map(t => t.id), 'duplicate registered type'); unique(operations.map(o => o.operation), 'duplicate registered operation');
    const ts = new Map(types.map(t => [t.id, Object.freeze({ ...t })]));
    const ops = new Map(operations.map(o => {
        ports(o.inputs, false);
        for (const p of o.outputs) { keys(p, ['name', 'type']); if (!name(p.name)) structure('invalid output'); typeShape(p.type); }
        unique(o.outputs.map(p => p.name), 'duplicate port');
        return [o.operation, Object.freeze({ ...o, inputs: immutable(structuredClone(o.inputs)), outputs: immutable(structuredClone(o.outputs)) })] as const;
    }));
    return Object.freeze({
        evaluate(document: Document, invocation: { inputs: Record<string, TypedRuntimeValue> }): Readonly<Record<string, unknown>> {
            validateDocument(document);
            // Own the graph too: no caller mutation or primitive callback can rewrite the active call.
            const doc = immutable(structuredClone(document));
            const groups = new Map(doc.groups.map(g => [g.operation, g.graph]));
            for (const id of groups.keys()) if (ops.has(id)) structure('group collides with registry operation');
            const fail = (cat: Category, path: string[], node: string, port: string | undefined, cause: string): never => { throw new ConstructionError(cat, path, node, port, cause); };
            const check = (type: Type, v: unknown, literal: boolean, path: string[], node: string, port: string): unknown => {
                if ('list' in type) {
                    if (!Array.isArray(v)) return fail('type', path, node, port, 'expected list');
                    return Object.freeze(v.map(x => check(type.list, x, literal, path, node, port)));
                }
                const t = ts.get(type.id); if (!t) return fail('unsupported', path, node, port, `type ${type.id}`);
                if (literal && !t.decode) return fail('type', path, node, port, 'type has no literal decoder');
                try { return immutable(t.validate(literal ? t.decode!(owned(v) as JSONValue) : owned(v))); }
                catch (e) { return fail(e instanceof RangeError || (e instanceof ConstructionError && e.category === 'resource') ? 'resource' : 'type', path, node, port, String(e)); }
            };
            const support = (t: Type, path: string[], node: string, port: string): void => {
                if ('list' in t) support(t.list, path, node, port); else if (!ts.has(t.id)) fail('unsupported', path, node, port, `type ${t.id}`);
            };
            const call = (op: string, supplied: Record<string, () => TypedRuntimeValue>, path: string[], boundary: string): Record<string, unknown> => {
                const graph = groups.get(op), primitive = ops.get(op);
                if (!graph && !primitive) return fail('unsupported', path, boundary, undefined, `operation ${op}`);
                const signature = graph ?? primitive!;
                for (const p of [...signature.inputs, ...signature.outputs]) support(p.type, path, boundary, p.name);
                for (const k of Object.keys(supplied)) if (!signature.inputs.some(p => p.name === k)) fail('input', path, boundary, k, 'unknown input');
                const inputs: Record<string, unknown> = Object.create(null);
                for (const p of signature.inputs) {
                    if (own(supplied, p.name)) {
                        const v = supplied[p.name]();
                        if (!equal(p.type, v.type)) fail('type', path, boundary, p.name, 'connection type mismatch');
                        inputs[p.name] = check(p.type, v.value, false, path, boundary, p.name);
                    } else if (own(p, 'default')) inputs[p.name] = check(p.type, p.default, true, path, boundary, p.name);
                    else fail('input', path, boundary, p.name, 'missing required input');
                }
                Object.freeze(inputs);
                const result: Record<string, unknown> = Object.create(null);
                if (graph) {
                    const cache = new Map<string, Record<string, unknown>>();
                    const resolve = (b: Binding, expected: Type, port: string, node: string): TypedRuntimeValue => {
                        if ('value' in b) return { type: expected, value: check(expected, b.value, true, path, node, port) };
                        if ('list' in b) {
                            if (!('list' in expected)) return fail('type', path, node, port, 'list assembly requires list type');
                            const values = b.list.map(x => {
                                const v = resolve(x, expected.list, port, node);
                                if (!equal(v.type, expected.list)) fail('type', path, node, port, 'list element type mismatch');
                                return v.value;
                            });
                            return { type: expected, value: values };
                        }
                        if ('input' in b) return { type: graph.inputs.find(p => p.name === b.input)!.type, value: inputs[b.input] };
                        const n = graph.nodes.find(n => n.id === b.node)!;
                        const sig = groups.get(n.operation) ?? ops.get(n.operation);
                        if (!sig) return fail('unsupported', path, n.id, b.output, `operation ${n.operation}`);
                        const output = sig.outputs.find(p => p.name === b.output);
                        if (!output) return fail('type', path, n.id, b.output, 'unknown output port');
                        if (!cache.has(n.id)) {
                            const args: Record<string, () => TypedRuntimeValue> = Object.create(null);
                            for (const [k, binding] of Object.entries(n.inputs)) args[k] = () => {
                                const p = sig.inputs.find(p => p.name === k)!;
                                return resolve(binding, p.type, k, n.id);
                            };
                            cache.set(n.id, call(n.operation, args, [...path, n.id], n.id));
                        }
                        return { type: output.type, value: cache.get(n.id)![b.output] };
                    };
                    for (const p of graph.outputs) {
                        const v = resolve(p.binding, p.type, p.name, boundary);
                        if (!equal(v.type, p.type)) fail('type', path, boundary, p.name, 'output type mismatch');
                        result[p.name] = check(p.type, v.value, false, path, boundary, p.name);
                    }
                } else {
                    let raw: Record<string, unknown>;
                    try { raw = primitive!.evaluate(inputs); }
                    catch (e) { return fail(e instanceof RangeError || (e instanceof ConstructionError && e.category === 'resource') ? 'resource' : 'evaluation', path, boundary, undefined, String(e)); }
                    if (!record(raw)) return fail('evaluation', path, boundary, undefined, 'outputs must be record');
                    for (const k of Object.keys(raw)) if (!primitive!.outputs.some(p => p.name === k)) fail('evaluation', path, boundary, k, 'undeclared output');
                    for (const p of primitive!.outputs) {
                        if (!own(raw, p.name)) fail('evaluation', path, boundary, p.name, 'missing output');
                        result[p.name] = check(p.type, raw[p.name], false, path, boundary, p.name);
                    }
                }
                return Object.freeze(result);
            };
            if (!record(invocation) || Object.keys(invocation).some(k => k !== 'inputs') || !record(invocation.inputs)) fail('input', [doc.entry], 'entry', undefined, 'invalid invocation');
            const args: Record<string, () => TypedRuntimeValue> = Object.create(null);
            for (const [k, v] of Object.entries(invocation.inputs)) {
                if (!record(v) || Object.keys(v).length !== 2 || !own(v, 'type') || !own(v, 'value')) fail('input', [doc.entry], 'entry', k, 'invalid typed input');
                typeShape(v.type);
                args[k] = () => v;
            }
            return call(doc.entry, args, [doc.entry], 'entry');
        },
    });
}
