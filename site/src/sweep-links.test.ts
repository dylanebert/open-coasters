import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { root } from '../scripts/build';
import { base, render } from './page';

test('sweep links the API row and both stills through the static guide', () => {
  const guide = readFileSync(`${root}/construction-contract.md`, 'utf8').split('## sweep a rail')[1]!;
  expect(guide).toContain('[`sweep`](placement-reference.md#sweep)');
  expect(guide).not.toContain('examples/');
  const page = render(root, { draft: true });
  expect(page.html).toContain('<a href="#placement-reference--sweep"><code>sweep</code></a>');
  expect(page.html).toContain('id="placement-reference--sweep"');
  expect(page.llms).toContain(`[\`sweep\`](${base}#placement-reference--sweep)`);
  for (const theme of ['light', 'dark']) {
    const figure = `assets/figures/swept-rail-${theme}.png`;
    expect(guide).toContain(figure);
    expect(page.assets.has(figure)).toBe(true);
    expect(page.html).toContain(`${base}${figure}`);
    if (theme === 'light') expect(page.llms).toContain(`${base}${figure}`);
  }
});

test('the joined recipe and single gap plate follow the individual operations and precede the recipe API', () => {
  for (const draft of [false, true]) {
    const { html, llms } = render(root, { draft });
    expect(html).toContain('id="placement-reference--join"');
    for (const [output, recipeStart, link, reference] of [
      [html, '<h2 id="construction-contract">', '<a href="#placement-reference--join"><code>join</code></a>', '<h2 id="placement-reference">'],
      [llms, '\n# recipe contract\n', `[\`join\`](${base}#placement-reference--join)`, '\n# recipe API\n'],
    ]) {
      let offset = -1;
      for (const marker of ['const ties = repeat(', 'curved-ties-light.png', 'const rail = sweep(',
        'swept-rail-light.png', link, 'const track = join([leftRail, rightRail, ties]);',
        'joined-track-light.png', 'const gapEnd = 2.2;', 'excluded: [{ start: 1.1, end: gapEnd }]',
        'tie-gap-light.png', reference]) {
        const next = output.indexOf(marker, offset + 1);
        expect(next, `missing or out of order: ${marker}`).toBeGreaterThan(offset);
        offset = next;
      }
      const recipe = output.indexOf(recipeStart);
      expect(recipe).toBeGreaterThan(-1);
      const section = output.slice(recipe, offset);
      for (const stem of ['joined-track', 'tie-gap']) {
        for (const theme of output === html ? ['light', 'dark'] : ['light']) {
          const url = `${base}assets/figures/${stem}-${theme}.png`;
          expect(section.split(url).length - 1, url).toBe(1);
        }
      }
      const gapStart = output === html ? 'id="construction-contract--leave-a-gap-between-ties"' : '\n## leave a gap between ties\n';
      const start = output.indexOf(gapStart);
      expect(start).toBeGreaterThan(-1);
      const gap = output.slice(start, offset);
      expect(gap).not.toContain('joined-track-');
      expect([...gap.matchAll(/tie-gap-light\.png/g)]).toHaveLength(1);
      if (output === html) {
        expect([...gap.matchAll(/<figure\b/g)]).toHaveLength(1);
        expect(gap.slice(gap.indexOf('</figure>') + '</figure>'.length).trim()).toMatch(/^<p>\S(?:(?!<\/p>)[\s\S])*<\/p>$/);
      } else {
        const result = gap.slice(gap.indexOf('\n', gap.indexOf('tie-gap-light.png'))).trim();
        expect(result.split(/\n\s*\n/)).toHaveLength(1);
        expect(result).toMatch(/^\S/);
      }
    }
    for (const stem of ['curved-ties', 'joined-track', 'tie-gap']) {
      for (const theme of ['light', 'dark']) expect(html).toContain(`${base}assets/figures/${stem}-${theme}.png`);
    }
  }
});
