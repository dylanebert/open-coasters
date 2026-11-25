import { join } from './geometry';
import type { Construction } from './native';
/** Inputs own the approach/branches/custom selections; no deduplication or connectivity inference. */
export function staticSwitch({ approach, left, right, custom }: { approach: Construction; left: Construction; right: Construction; custom: Construction }): Construction {
    return join([approach, left, right, custom]);
}
