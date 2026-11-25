import { instance, sampleFrames, type Path } from '../construction/geometry';
import type { Construction, Content } from '../construction/native';

export function oneTie({ path, tie, distance }: { path: Path; tie: Content; distance: number }): Construction {
    return instance(tie, sampleFrames(path, [distance]));
}
