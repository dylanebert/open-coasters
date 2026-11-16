import sharp from 'sharp';
import { overlay, palettes } from '../src/profile-plate';
export async function recomposeProfile(theme:keyof typeof palettes) {
  const root=new URL('../../assets/figures/',import.meta.url);
  await sharp(new URL(`profile-${theme}-raw.png`,root).pathname).composite([{input:Buffer.from(overlay(theme))}]).png().toFile(new URL(`profile-${theme}.png`,root).pathname);
}
if(import.meta.main) for(const theme of ['light','dark'] as const) await recomposeProfile(theme);
