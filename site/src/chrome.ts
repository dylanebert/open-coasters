import { palettes } from './theme-data';

export const interactionColors = { light: '#965b32', dark: '#d49560' };

export const githubIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4M9 18c-4.51 2-5-2-7-2"/></svg>';
const light = `--bg:${palettes.light.bg};--ink:${palettes.light.ink};--muted:#6e655c;--line:#e3dbcf;--bg2:#efe9df;--gold:${interactionColors.light};color-scheme:light`;
const dark = `--bg:${palettes.dark.bg};--ink:${palettes.dark.ink};--muted:#a08c78;--line:#2a2420;--bg2:#1c1917;--gold:${interactionColors.dark};color-scheme:dark`;
export function styles(base: string) { return `
@font-face{font-family:Plex;src:url('${base}fonts/plex/IBMPlexSans-Regular-Latin1.woff2')}
@font-face{font-family:Mono;src:url('${base}fonts/mono/JetBrainsMono-Regular.woff2')}
:root{${light}}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}
:root[data-theme=dark]{${dark}}
*{box-sizing:border-box}html{scrollbar-gutter:stable;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 Plex,system-ui,sans-serif}
main,header,footer{max-width:880px;margin:auto;padding:24px}
header{display:flex;justify-content:flex-end;align-items:center;width:calc(100% - 88px);padding-top:20px;padding-bottom:0}
main{padding-top:16px;padding-bottom:48px}
h1,h2,h3,h4,h5,h6{scroll-margin-top:24px;line-height:1.3}
h1{font-size:36px;font-weight:600;margin:12px 0 24px}
h2{font-size:32px;font-weight:600;margin:64px 0 24px;padding-top:24px;border-top:1px solid var(--line)}
h3{font-size:23px;font-weight:600;margin:40px 0 16px}
h4{font-size:18px;font-weight:600;margin:28px 0 12px}
h5,h6{font-size:17px;font-weight:600;margin:24px 0 12px}
a{color:inherit;text-underline-offset:3px;text-decoration-color:var(--muted)}a:hover{color:var(--gold)}
p,ul,ol{margin:16px 0}li+li{margin-top:6px}ul,ol{padding-left:24px}
img{display:block;max-width:100%;height:auto}picture{display:block;max-width:560px;margin:24px auto}.figure-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-width:1120px;margin:24px auto;gap:16px}.figure-pair picture{margin:0;width:100%}@media(max-width:700px){.figure-pair{grid-template-columns:1fr;max-width:560px}}
.one-tie{margin:24px 0}
.one-tie picture{max-width:540px}
.repeated-ties{margin:24px 0}.repeated-ties picture{max-width:600px}
pre{overflow:auto;margin:24px 0;padding:20px 24px;background:var(--bg2);border-radius:2px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--line),var(--muted) 40%)}code,pre{font-family:Mono,monospace;font-size:.85em}
table{display:block;overflow:auto;border-collapse:collapse}td,th{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left}
summary{cursor:pointer;color:var(--muted);font-size:15px}summary:hover{color:var(--ink)}details{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;margin:24px 0}
.icon{display:inline-flex;align-items:center;justify-content:center;color:var(--muted);text-decoration:none;min-width:30px;min-height:30px;vertical-align:middle}
.icon svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.icon:hover{color:var(--gold)}
.toggle{position:fixed;z-index:1;top:14px;right:14px;width:30px;height:30px;padding:0;border:1px solid var(--line);border-radius:2px;background:var(--bg);color:var(--muted);font:14px/1 system-ui,sans-serif;cursor:pointer}.toggle:hover{color:var(--gold)}
[hidden]{display:none!important}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
footer{display:flex;gap:20px;flex-wrap:wrap;border-top:1px solid var(--line);font:12px/1.5 Mono,monospace;color:var(--muted);padding-top:20px;padding-bottom:64px}
@media(max-width:600px){main,header,footer{padding-left:16px;padding-right:16px}pre{padding-inline:16px}body{font-size:16px}h1{font-size:30px}h2{font-size:29px}h3{font-size:21px}}
`; }
export const themeScript = `const darkMedia='(prefers-color-scheme: dark)';const darkSources=[...document.querySelectorAll('picture source')].filter(s=>s.media.includes(darkMedia)).map(s=>[s,s.media]);function apply(t){document.documentElement.dataset.theme=t;darkSources.forEach(([s,media])=>{s.media=t==='dark'?media.replace(darkMedia,'(min-width: 0px)'):'not all'})}try{let t=localStorage.getItem('coasters-theme');if(t==='light'||t==='dark')apply(t)}catch{};let b=document.querySelector('[data-toggle]');b.hidden=false;b.onclick=()=>{let t=(document.documentElement.dataset.theme|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark'?'light':'dark';apply(t);try{localStorage.setItem('coasters-theme',t)}catch{}};`;
