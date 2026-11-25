import { contextCamera } from '../../visualizer/view';
import { plate } from './plate';
export const selected = [0,0,.55] as const;
export const tieOffsets = [-1.05,-.65,-.25,.15,.55] as const;
export function placed(v: readonly number[], z: number): [number,number,number] { return [v[0]!,v[1]!,v[2]!+z]; }
export function contextPlate() {
  return {...plate(), size:.94, ...contextCamera,
    origin:placed(plate().origin,selected[2]), axes:plate().axes.map(v=>placed(v,selected[2]))};
}
export { ghostColor, rails } from '../../visualizer/context-rails';
