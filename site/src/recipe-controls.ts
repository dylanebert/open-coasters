import { defaultGapEnd, defaultSpacing, defaultTrackEnd } from './guide-recipe';

type Control = { name: string; min: string; max: string; step: string; label: string };
function define(control: Control, value: number) {
  const initial = value.toFixed(control.step.split('.')[1]!.length);
  return { ...control, initial };
}
const spacing = define({ name: 'spacing', min: '0.4', max: '0.8', step: '0.1', label: 'Tie spacing in meters' }, defaultSpacing);
const end = define({ name: 'trackEnd', min: '0.10', max: defaultTrackEnd.toFixed(2), step: '0.10', label: 'Track end in meters' }, defaultTrackEnd);
const panels = [
  { figure: 'repeated-ties', stem: 'curved-ties', controls: [spacing] },
  { figure: 'swept-rail', stem: 'swept-rail', controls: [end] },
  { figure: 'joined-track', stem: 'joined-track', controls: [spacing, end] },
  { figure: 'tie-gap', stem: 'tie-gap', controls: [define({ name: 'gapEnd', min: '1.2', max: '3.6', step: '0.1', label: 'Gap end in meters' }, defaultGapEnd)] },
] as const;

export function recipeControls(html: string) {
  for (const { figure, stem, controls } of panels) {
    const block = new RegExp(`(<pre><code class="language-ts">)([^<]*)(</code></pre>\\s*<figure class="${figure}")>`);
    if (!block.test(html)) throw Error(`Missing recipe snippet for ${figure}`);
    html = html.replace(block, (_, open, code: string, close) => {
      for (const { name, min, max, step, initial, label } of controls) {
        const declaration = `const ${name} = ${initial};\n`;
        if (!code.split('\n').includes(declaration.trimEnd())) throw Error(`Unexpected ${figure} default: expected ${declaration.trimEnd()}`);
        const aria = figure === 'joined-track' ? `Joined track ${label.toLowerCase()}` : label;
        const literal = `<span class="recipe-literal">${initial}</span>`;
        const input = `<input class="recipe-range" type="range" min="${min}" max="${max}" step="${step}" value="${initial}" aria-label="${aria}" data-input="${name}" hidden>`;
        code = code.replace(declaration, `const ${name} = ${literal};${input}\n`);
      }
      return `${open}${code}${close} data-recipe="${stem}">`;
    });
  }
  return html.replace('</head>', `<style>
[data-recipe] picture{position:relative}
.recipe-preview{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
.recipe-literal{color:var(--gold)}
.recipe-range{width:80px;height:1em;vertical-align:middle;margin:0 0 0 12px;accent-color:var(--gold)}
.recipe-range:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
</style></head>`).replace('</body>', '<script type="module" src="./recipe-preview.js"></script></body>');
}
