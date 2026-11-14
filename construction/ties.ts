import { parseDocument, type TypedRuntimeValue } from './kernel';
import { standardRegistry } from './geometry';
import type { Construction } from './native';
/** Parameterized CPU witness. Pass the ORIGINAL ties.json text, not reserialized parsed JSON. */
export function ties(source: string, inputs: Record<string, TypedRuntimeValue>): Construction {
    return standardRegistry().evaluate(parseDocument(source), { inputs }).construction as Construction;
}
