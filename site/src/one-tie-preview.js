// Loaded only by the private preview build. Keep the still until a bitmap is ready.
if (navigator.gpu) {
  enable({ figure: 'one-tie', prefix: 'sampleFrames(path, [', initial: '2', suffix: ']);',
    min: '0', max: document.querySelector('script[data-track-end]').dataset.trackEnd, label: 'Sampled distance in meters', title: 'Live one-tie preview' });
}

function enable({ figure, prefix, initial, suffix, min, max, label, title }) {
  const picture = document.querySelector(`.${figure} picture`);
  const token = prefix + initial + suffix;
  const text = [...document.querySelectorAll('pre code')].map(el => el.firstChild)
    .find(node => node instanceof Text && node.data.includes(token));
  if (!picture || !text) return;
  const style = document.createElement('style');
  style.textContent = `
    .${figure} picture, .tie-sample { position: relative }
    .tie-sample { display: inline-block; width: 6ch }
    .tie-argument { color: var(--gold) }
    .tie-range { position: absolute; left: calc(100% + 10px); top: 50%;
      transform: translateY(-50%); margin: 0; width: clamp(2rem, calc(16vw - 2rem), 5rem);
      accent-color: var(--gold); }
    .tie-preview { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; pointer-events: none }
    .tie-preview[hidden] { display: block; visibility: hidden }
    @media (max-width: 400px) {
      pre:has(+ .one-tie) code { letter-spacing: -.05em }
    }
  `;
  document.head.append(style);
  const index = text.data.indexOf(token) + prefix.length;
  const digit = text.splitText(index);
  const punctuation = digit.splitText(initial.length);
  punctuation.splitText(suffix.length);
  const sampleEnd = document.createElement('span');
  sampleEnd.className = 'tie-sample';
  const argument = document.createElement('span');
  argument.className = 'tie-argument';
  digit.replaceWith(sampleEnd);
  argument.append(digit);
  const range = document.createElement('input');
  range.className = 'tie-range';
  Object.assign(range, { type: 'range', min, max, step: '0.1', value: initial });
  range.setAttribute('aria-label', label);
  sampleEnd.append(argument, punctuation, range);

  let frame, ready = false, id = 0, timer;
  const preference = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => document.documentElement.dataset.theme || (preference.matches ? 'dark' : 'light');
  const observer = new MutationObserver(themeChanged);
  function fail() {
    clearTimeout(timer);
    frame?.remove();
    frame = undefined;
    digit.data = initial;
    sampleEnd.replaceWith(digit, punctuation);
    observer.disconnect();
    preference.removeEventListener('change', themeChanged);
    window.removeEventListener('message', receive);
  }
  function request() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(fail, 8000);
    frame.contentWindow.postMessage({ oneTie: { id: ++id, distance: range.valueAsNumber, theme: theme() } }, location.origin);
  }
  function themeChanged() {
    if (!frame) return;
    frame.hidden = true;
    digit.data = initial;
    request();
  }
  function receive(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.oneTieReady === -1) fail();
    else if (event.data?.oneTieReady === 0) { ready = true; request(); }
  }
  const viewport = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) start();
  });
  function start() {
    if (frame) return;
    viewport.disconnect();
    frame = document.createElement('iframe');
    frame.className = 'tie-preview';
    frame.title = title;
    frame.tabIndex = -1;
    frame.hidden = true;
    frame.addEventListener('one-tie-frame', ({ detail }) => {
      if (detail.id !== id) return;
      try {
        detail.render();
        digit.data = range.value;
        frame.hidden = false;
        clearTimeout(timer);
      } catch { fail(); }
    });
    frame.src = './visualizer/?preview';
    picture.append(frame);
    timer = setTimeout(fail, 8000);
  }
  window.addEventListener('message', receive);
  viewport.observe(range.closest('pre'));
  range.addEventListener('focus', start, { once: true });
  range.addEventListener('input', () => { start(); request(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  preference.addEventListener('change', themeChanged);
}
