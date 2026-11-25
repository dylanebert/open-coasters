// WCAG sRGB relative luminance; accepts hex tokens and browser-computed rgb().
export function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const channels = color.startsWith('#')
      ? color.slice(1).match(/../g)!.map(c => parseInt(c, 16))
      : color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    return channels.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i]!, 0);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + .05) / (lo! + .05);
}
