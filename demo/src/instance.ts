export { requireStaticInstance } from '../../part';
import { readNative, nativeURL } from '../../construction/native';

/** Own dependent bytes too; neither the renderer nor graph can refetch live buffers. */
export async function staticInstanceSnapshot(url: URL): Promise<URL> {
    const snapshot = await readNative(url);
    return nativeURL(snapshot.document);
}

export const placements = [
    { translation: [-1.5, 0, 0] as [number, number, number] },
    {
        translation: [1.5, 0, 0] as [number, number, number],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number, number],
    },
];
