// Runs in every frame. Styles are forced inline with !important so they beat
// site CSS and also reach elements inside shadow DOM.
if (!window.__fvw) {
  const MAX_Z = '2147483647';
  const saved = new Map(); // element -> original style attribute
  let mode = null;         // 'video' | 'frame' | null
  let target = null;       // the <video>, or the <iframe> holding it
  let timer = null;

  // Any of these on an ancestor would trap a position:fixed child inside it.
  const ANCESTOR = {
    'transform': 'none', 'translate': 'none', 'scale': 'none', 'rotate': 'none',
    'filter': 'none', 'backdrop-filter': 'none', 'perspective': 'none',
    'contain': 'none', 'will-change': 'auto', 'clip-path': 'none', 'mask': 'none',
    'content-visibility': 'visible', 'z-index': MAX_Z,
  };
  const BASE = {
    'position': 'fixed', 'left': '0', 'right': 'auto', 'bottom': 'auto',
    'max-width': 'none', 'max-height': 'none', 'min-width': '0', 'min-height': '0',
    'margin': '0', 'padding': '0', 'transform': 'none', 'translate': 'none', 'scale': 'none',
    'rotate': 'none', 'z-index': MAX_Z, 'visibility': 'visible', 'opacity': '1', 'display': 'block',
  };

  function force(el, props) {
    if (!saved.has(el)) saved.set(el, el.getAttribute('style'));
    for (const [k, v] of Object.entries(props)) {
      if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') {
        el.style.setProperty(k, v, 'important');
      }
    }
  }

  function restoreAll() {
    for (const [el, s] of saved) s == null ? el.removeAttribute('style') : el.setAttribute('style', s);
    saved.clear();
  }

  function parentOf(el) {
    return el.parentElement || el.getRootNode().host || null;
  }

  function deepAll(selector, root = document, out = []) {
    root.querySelectorAll(selector).forEach(el => out.push(el));
    root.querySelectorAll('*').forEach(el => el.shadowRoot && deepAll(selector, el.shadowRoot, out));
    return out;
  }

  function score(v) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    const playing = !v.paused && !v.ended && v.readyState > 2;
    if (!area && !playing) return 0;
    return (playing ? 1e9 : 0) + area;
  }

  function bestVideo() {
    return deepAll('video').map(v => [v, score(v)]).filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  function apply() {
    if (mode === 'video' && !target?.isConnected) {
      restoreAll();
      target = bestVideo();
    }
    if (!target?.isConnected) return;

    const W = innerWidth, H = innerHeight;
    if (mode === 'video') {
      const ar = target.videoWidth && target.videoHeight ? target.videoHeight / target.videoWidth : 9 / 16;
      const h = W * ar;
      force(target, {
        ...BASE, 'top': `${(H - h) / 2}px`, 'width': `${W}px`, 'height': `${h}px`,
        'object-fit': 'fill', 'background': '#000', 'box-shadow': '0 0 0 100vmax #000',
      });
    } else {
      force(target, { ...BASE, 'top': '0', 'width': '100vw', 'height': '100vh', 'border': '0' });
    }
    for (let el = parentOf(target); el && el !== document.documentElement; el = parentOf(el)) {
      force(el, el === document.body ? { ...ANCESTOR, 'overflow': 'hidden' } : ANCESTOR);
    }
    force(document.documentElement, { 'overflow': 'hidden' });
  }

  function start(newMode, el) {
    off();
    mode = newMode;
    target = el;
    apply();
    timer = setInterval(apply, 500);
    addEventListener('resize', apply);
    addEventListener('keydown', onKey, true);
    if (window !== top) parent.postMessage({ __fvw: 'expand' }, '*');
  }

  function off() {
    clearInterval(timer);
    timer = null;
    removeEventListener('resize', apply);
    removeEventListener('keydown', onKey, true);
    restoreAll();
    mode = target = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') chrome.runtime.sendMessage({ fvw: 'off' });
  }

  // A child frame fitted its video: stretch the <iframe> holding it over this window.
  addEventListener('message', e => {
    if (e.data?.__fvw !== 'expand') return;
    const frame = deepAll('iframe, frame').find(f => f.contentWindow === e.source);
    if (frame) start('frame', frame);
  });

  window.__fvw = {
    status: () => ({ on: !!mode, score: Math.max(0, ...deepAll('video').map(score)) }),
    fit: () => {
      const v = bestVideo();
      if (v) start('video', v);
      return !!v;
    },
    off,
  };
}
