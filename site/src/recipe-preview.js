const root = document.documentElement;
const scheme = matchMedia('(prefers-color-scheme: dark)');
const theme = () => root.dataset.theme || (scheme.matches ? 'dark' : 'light');

if (navigator.gpu) {
  for (const figure of document.querySelectorAll('[data-recipe]')) enable(figure);
}

function enable(figure) {
  const code = figure.previousElementSibling;
  const controls = [...code.querySelectorAll('.recipe-range')];
  const literals = [...code.querySelectorAll('.recipe-literal')];
  const spacing = code.querySelector('[data-input="spacing"]');
  const end = code.querySelector('[data-input="trackEnd"]');
  const gapEnd = code.querySelector('[data-input="gapEnd"]');
  const picture = figure.querySelector('picture');
  const still = picture.querySelector('img');
  let frame, ready = false, id = 0, timer;
  const observer = new MutationObserver(request);
  const viewport = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) start();
  });

  function fail() {
    clearTimeout(timer);
    frame?.remove();
    frame = undefined;
    ready = false;
    still.style.visibility = '';
    controls.forEach((control, i) => {
      control.hidden = true;
      literals[i].textContent = control.defaultValue;
      control.removeEventListener('focus', start);
      control.removeEventListener('input', edit);
    });
    observer.disconnect();
    scheme.removeEventListener('change', request);
    window.removeEventListener('message', receive);
  }
  function request() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(fail, 8000);
    frame.contentWindow.postMessage({ oneTie: {
      id: ++id, distance: spacing?.valueAsNumber, end: end?.valueAsNumber,
      gapEnd: gapEnd?.valueAsNumber, theme: theme(),
    } }, location.origin);
  }
  function receive(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.oneTieReady === -1) fail();
    else if (event.data?.oneTieReady === 0) { ready = true; request(); }
  }
  function start() {
    if (frame) return;
    viewport.disconnect();
    frame = document.createElement('iframe');
    frame.className = 'recipe-preview';
    frame.title = `Live ${figure.dataset.recipe.replace('-', ' ')}`;
    frame.tabIndex = -1;
    frame.hidden = true;
    frame.addEventListener('one-tie-frame', ({ detail }) => {
      if (detail.id !== id) return;
      try {
        detail.render();
        frame.hidden = false;
        still.style.visibility = 'hidden';
        controls.forEach((control, i) => {
          literals[i].textContent = control.valueAsNumber.toFixed(control.step.split('.')[1].length);
        });
        clearTimeout(timer);
      } catch { fail(); }
    });
    frame.src = `./visualizer/?preview&recipe=${figure.dataset.recipe}`;
    picture.append(frame);
    timer = setTimeout(fail, 8000);
  }
  function edit() { start(); request(); }
  window.addEventListener('message', receive);
  observer.observe(root, { attributeFilter: ['data-theme'] });
  scheme.addEventListener('change', request);
  viewport.observe(code);
  for (const control of controls) {
    control.hidden = false;
    control.addEventListener('focus', start, { once: true });
    control.addEventListener('input', edit);
  }
}
