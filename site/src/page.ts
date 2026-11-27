import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { boundedPath } from './paths';
import { Marked } from 'marked';
import { githubIcon, styles, themeScript } from './chrome';
export const base = '/open-coasters/';
const repo = 'https://github.com/dylanebert/open-coasters/blob/main/';
const slug = (s: string) => s.toLowerCase().replace(/<[^>]*>/g,'').replace(/[^\w\s-]/g,'').replace(/\s/g,'-');
const key = (s: string) => s.replace(/\.md$/, '');
const inlineAnchor = /^<span id="(\w+)">$/;
export type RenderOptions = { draft?: boolean };
// Only these draft authority files are exposed, as raw text, never rendered views.
export const draftOwners = [
  'construction/geometry.ts', 'construction/repeat.ts', 'construction/sweep.ts', 'construction/section.ts',
] as const;
export function render(root: string, options: RenderOptions = {}) {
  const read = (p: string) => readFileSync(boundedPath(root,p),'utf8');
  const spec = read('spec.md');
  const parser = new Marked();
  const tokens = parser.lexer(spec);
  const at = tokens.findIndex(t=>t.type==='heading' && t.text.toLowerCase()==='contents');
  if(at<0) throw Error('Missing Contents');
  const outline = tokens.slice(at+1).find(t=>t.type==='list');
  if(!outline) throw Error('Missing Contents list');
  const sources = ['spec.md'];
  parser.walkTokens([outline], t=>{ if(t.type==='link' && !t.href.startsWith('#')) sources.push(t.href); });
  const levels = new Map<string, number>();
  function listLevels(list: any, depth = 2) {
    for (const item of list.items) for (const token of item.tokens) {
      if (token.type === 'list') listLevels(token, depth + 1);
      else if (token.tokens) parser.walkTokens(token.tokens, t => {
        if (t.type === 'link' && !t.href.startsWith('#')) levels.set(t.href, depth);
      });
    }
  }
  listLevels(outline);
  if(new Set(sources).size!==sources.length) throw Error('Duplicate source');
  const docs = new Map(sources.map(s=>[s,read(s)]));
  const ids = new Map<string, Map<string, string>>();
  const documentIds = new Map<string, string>();
  for(const [s,text] of docs) {
    const set = new Map<string, string>();
    parser.walkTokens(parser.lexer(text),t=>{
      const heading = t.type === 'heading';
      const id = heading ? slug(t.text) : t.type === 'html' ? inlineAnchor.exec(t.text)?.[1] : undefined;
      if (!id) return;
      if(set.has(id)) throw Error(`Duplicate anchor ${s}#${id}`);
      const target=s==='spec.md'?id:heading && t.depth===1?key(s):key(s)+'--'+id;
      set.set(id,target);
      if(heading && !documentIds.has(s)) documentIds.set(s,target);
    });
    ids.set(s,set);
  }
  const assets = new Set<string>();
  function url(value: string, source: string): string {
    if(value.startsWith('https://dylanebert.com/open-coasters/')) return base+value.slice('https://dylanebert.com/open-coasters/'.length);
    if(/^(https?:|mailto:)/.test(value)) return value;
    const [path='',hash] = value.split('#');
    const file = path ? relative(resolve(root), boundedPath(root, resolve(dirname(boundedPath(root,source)),path))) : source;
    if(!existsSync(resolve(root,file))) throw Error(`Missing local target: ${file}`);
    if(docs.has(file)) {
      if(hash && !ids.get(file)!.has(hash)) throw Error(`Missing anchor: ${file}#${hash}`);
      return '#'+(hash ? ids.get(file)!.get(hash) : documentIds.get(file));
    }
    if(/\.(png|jpg|svg)$/.test(file)) {assets.add(file); return base+file;}
    if(options.draft && draftOwners.some(owner => owner === file)) return base+'draft/'+file+'.txt'+(hash?'#'+hash:'');
    return repo+file+(hash?'#'+hash:'');
  }
  let llms=''; let body='';
  function normalizeMarkdown(text: string, source: string) {
    return text.replace(/\]\(([^)]+)\)/g,(_,value)=>`](${url(value,source).replace(/^#/,base+'#')})`)
      .replace(/(src|srcset|href)="([^"]+)"/g,(_,attr,value)=>`${attr}="${url(value,source).replace(/^#/,base+'#')}"`);
  }
  for(const [source,original] of docs) {
    const markdown=source==='spec.md' ? original.replace(tokens[at]!.raw,'').replace(outline.raw,'') : original;
    const local = new Marked();
    const renderer = new local.Renderer();
    const headingLevel = (depth: number) => source === 'spec.md' ? depth : Math.min(6, depth + (levels.get(source) ?? 2) - 1);
    renderer.heading = function({text,depth,tokens}) { return `<h${headingLevel(depth)} id="${ids.get(source)!.get(slug(text))}">${this.parser.parseInline(tokens)}</h${headingLevel(depth)}>\n`; };
    renderer.link = function({href,tokens}) { return `<a href="${url(href,source)}">${this.parser.parseInline(tokens)}</a>`; };
    renderer.image = ({href,text}) => `<img src="${url(href,source)}" alt="${text.replaceAll('"','&quot;')}">`;
    renderer.html = ({text}) => text.replace(inlineAnchor,(_,id)=>`<span id="${ids.get(source)!.get(id)}">`)
      .replace(/(src|srcset|href)="([^"]+)"/g,(_,attr,value)=>`${attr}="${url(value,source)}"`);
    local.use({renderer});
    body+=local.parse(markdown);
    // Keep the complete source narrative, including reference disclosures and figure descriptions.
    const normalized = normalizeMarkdown(original, source);
    llms+=normalized
      .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g,(_,src,alt)=>`![${alt}](${src})`)
      .replace(/<a href="([^"]+)">([^<]+)<\/a>/g,'[$2]($1)')
      .replace(/<source[^>]*>/g,'').replace(/<\/?(?:figure|figcaption|picture|details|summary|span)[^>]*>/g,'')+'\n';
  }
  const css = styles(base);
  return {sources,assets, llms, html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Coasters</title><link rel="alternate" type="text/plain" href="${base}llms.txt"><style>${css}</style></head><body><header><a class="icon" href="${repo.slice(0,-10)}" aria-label="GitHub" title="GitHub">${githubIcon}</a><button class="toggle" hidden data-toggle type="button" aria-label="Toggle light and dark" title="Toggle light and dark">◐</button></header><main>${body}</main><footer><a href="${base}llms.txt">llms.txt</a><a href="https://github.com/dylanebert/open-coasters">github</a><a href="${repo}LICENSE">license</a></footer><script>${themeScript}</script></body></html>`};
}
