import { parseDocument } from './kernel';
import { ids, nominal, standardRegistry } from './geometry';
import type { Construction } from './native';
/** Inputs own the approach/branches/custom selections; no deduplication or connectivity inference. */
export function staticSwitch(source: string, inputs: { approach: Construction; left: Construction; right: Construction; custom: Construction }): Construction {
    return standardRegistry().evaluate(parseDocument(source), {inputs:Object.fromEntries(Object.entries(inputs).map(([name,value])=>[name,{type:nominal(ids.construction),value}]))}).construction as Construction;
}
