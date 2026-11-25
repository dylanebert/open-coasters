import sharp from 'sharp';
import { plate, palettes, annotations } from '../src/plate';
import { contextPlate } from '../src/tie-context';

export async function recompose(theme: keyof typeof palettes, context=false) {
  const p=context ? contextPlate() : plate(), colors=palettes[theme];
  const name=context ? 'tie-context' : 'tie-frame';
  await sharp(new URL(`../../assets/figures/${name}-${theme}-raw.png`,import.meta.url).pathname)
    .composite([{input:Buffer.from(annotations(p,colors.ink,colors.bg))}])
    .png().toFile(new URL(`../../assets/figures/${name}-${theme}.png`,import.meta.url).pathname);
}
if(import.meta.main) for(const theme of ['light','dark'] as const) for(const context of [false,true]) await recompose(theme,context);
