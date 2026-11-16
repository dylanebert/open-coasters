import sharp from 'sharp';
import { plate, palettes, annotations } from '../src/plate';

export async function recompose(theme: keyof typeof palettes) {
  const p=plate(), colors=palettes[theme];
  await sharp(new URL(`../../assets/figures/tie-frame-${theme}-raw.png`,import.meta.url).pathname)
    .composite([{input:Buffer.from(annotations(p,colors.ink,colors.bg))}])
    .png().toFile(new URL(`../../assets/figures/tie-frame-${theme}.png`,import.meta.url).pathname);
}
if(import.meta.main) for(const theme of ['light','dark'] as const) await recompose(theme);
