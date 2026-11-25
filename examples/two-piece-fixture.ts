import { compose, frame, instance, join, type Frame } from '../construction/geometry';
import type { Construction } from '../construction/native';

/** Resolve the two fixture-local pieces at one pose; fixed geometry is composed separately. */
export function twoPieceFixture(pose: Frame, pieces: readonly [Construction, Construction]): Construction {
    if (!Array.isArray(pieces) || pieces.length !== 2) throw Error('fixture requires two pieces');
    const fixture = frame(pose);
    const local = join(pieces);
    return join(local.placements.map(p => instance(p.content, [compose(fixture, p.frame)])));
}
