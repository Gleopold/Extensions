// Records every Facebook/Instagram video that starts playing (including autoplay
// while scrolling), plus reel URLs the page navigates through, into storage.
(() => {
  const MAX_ENTRIES = 2000;
  const site = location.hostname.includes('instagram') ? 'instagram' : 'facebook';
  const POST_BOUNDARY = 'article, [role="article"], [role="dialog"], [aria-posinset]';
  const UI_TEXT = /^(like|comment|share|send|save|follow|following|reply|more|see more|see translation|reels?|sponsored|·|\d+[kmb]?|\d+[smhdw])$/i;
  const lastRecorded = new WeakMap(); // video -> timestamp

  // Turns any post/reel/video link into one stable URL, or null if it isn't one.
  function canonical(href) {
    let u;
    try { u = new URL(href, location.href); } catch { return null; }
    const p = u.pathname;
    let m;
    if (/(^|\.)instagram\.com$/.test(u.hostname)) {
      m = p.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/);
      if (!m) return null;
      const kind = m[1] === 'reels' ? 'reel' : m[1];
      return { url: `https://www.instagram.com/${kind}/${m[2]}/`, video: kind !== 'p' };
    }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const fb = 'https://www.facebook.com';
    if ((m = p.match(/^\/reel\/(\d+)/))) return { url: `${fb}/reel/${m[1]}`, video: true };
    if ((m = p.match(/\/videos\/(?:[^/]+\/)*?(\d{6,})/))) return { url: `${fb}/watch/?v=${m[1]}`, video: true };
    if (p.startsWith('/watch') && u.searchParams.get('v')) return { url: `${fb}/watch/?v=${u.searchParams.get('v')}`, video: true };
    if ((m = p.match(/^\/share\/([vr])\/([\w-]+)/))) return { url: `${fb}/share/${m[1]}/${m[2]}/`, video: true };
    if ((m = p.match(/^\/(?:groups\/[^/]+|[\w.]+)\/posts\/[\w-]+/))) return { url: fb + m[0], video: false };
    if (/^\/(story|permalink)\.php$/.test(p)) {
      const s = u.searchParams.get('story_fbid'), id = u.searchParams.get('id');
      if (s && id) return { url: `${fb}${p}?story_fbid=${s}&id=${id}`, video: false };
    }
    return null;
  }

  // Walks up from the video until it finds a link to the post, without leaving the post.
  function findPost(video) {
    let el = video, box = video, best = null;
    for (let depth = 0; depth < 30 && (el = el.parentElement) && el !== document.body; depth++) {
      if ([...el.querySelectorAll('video')].some(v => v !== video)) break; // reached a neighbouring post
      box = el;
      const links = [...el.querySelectorAll('a[href]')].map(a => canonical(a.href)).filter(Boolean);
      best = links.find(l => l.video) || best || links[0] || null;
      if (best?.video || el.matches(POST_BOUNDARY)) break;
    }
    return { link: best, box };
  }

  // Facebook fills in some post links only on hover; nudge them, then look again.
  function revealLinks(box) {
    box.querySelectorAll('a[role="link"]').forEach(a => {
      if (!a.getAttribute('href') || a.getAttribute('href') === '#') {
        a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
    });
  }

  // First two meaningful pieces of text in the post, usually author and caption.
  function snippet(box) {
    const parts = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    while (parts.length < 2 && walker.nextNode()) {
      const s = walker.currentNode.nodeValue.trim();
      if (s.length > 1 && !UI_TEXT.test(s) && !parts.includes(s)) parts.push(s);
    }
    return parts.join(' — ').slice(0, 160);
  }

  function thumbnail(video, box) {
    if (video.poster) return video.poster;
    const img = [...box.querySelectorAll('img')].find(i => i.naturalWidth >= 120 && /^https:/.test(i.src));
    return img?.src || '';
  }

  let queue = Promise.resolve();
  function save(entry) {
    queue = queue.then(async () => {
      const { history = [] } = await chrome.storage.local.get('history');
      const i = history.findIndex(h => h.url === entry.url);
      if (i >= 0) {
        const old = history.splice(i, 1)[0];
        entry = { ...old, ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v)), first: old.first };
      }
      history.unshift(entry);
      history.length = Math.min(history.length, MAX_ENTRIES);
      await chrome.storage.local.set({ history });
    }).catch(e => console.warn('Improved History:', e));
  }

  function entryFor(link, video, box) {
    const now = Date.now();
    return {
      url: link.url, site, video: link.video,
      title: box ? snippet(box) : '', thumb: video && box ? thumbnail(video, box) : '',
      first: now, last: now,
    };
  }

  async function onPlay(e) {
    const video = e.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (Date.now() - (lastRecorded.get(video) || 0) < 10000) return;
    lastRecorded.set(video, Date.now());

    let { link, box } = findPost(video);
    if (!link) {
      revealLinks(box);
      await new Promise(r => setTimeout(r, 400));
      ({ link, box } = findPost(video));
    }
    link ||= canonical(location.href); // reel feeds and opened posts: the page URL is the video
    if (link) save(entryFor(link, video, box));
  }

  document.addEventListener('play', onPlay, true); // media events don't bubble; capture does

  // Reel feeds change the URL as you swipe; record each one.
  let lastHref = '';
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const link = canonical(location.href);
    if (link?.video) save({ ...entryFor(link), title: document.title.replace(/ \| (Facebook|Instagram)$/, '') });
  }, 1000);
})();
