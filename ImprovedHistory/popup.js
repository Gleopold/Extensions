const $ = id => document.getElementById(id);
const SHOWN_LIMIT = 300;
let history = [];

function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const site = $('site').value;
  const matches = history.filter(h =>
    (!site || h.site === site) && (!q || `${h.title} ${h.url}`.toLowerCase().includes(q)));

  const list = $('list');
  list.replaceChildren();
  if (!matches.length) {
    const li = document.createElement('div');
    li.className = 'empty';
    li.textContent = history.length ? 'No matches.' : 'Nothing yet. Scroll Facebook or Instagram and videos you see will show up here.';
    list.append(li);
  }
  for (const h of matches.slice(0, SHOWN_LIMIT)) {
    const li = document.createElement('li');
    li.title = h.url;

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    if (h.thumb) img.src = h.thumb;
    img.onerror = () => img.removeAttribute('src'); // social CDN thumbnails expire

    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = h.title || h.url.replace(/^https:\/\/www\./, '');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const siteName = document.createElement('span');
    siteName.className = `site ${h.site}`;
    siteName.textContent = h.site === 'instagram' ? 'Instagram' : 'Facebook';
    meta.append(siteName, ` · ${h.video ? 'video' : 'post'} · ${ago(h.last)}`);
    info.append(title, meta);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Remove';
    del.onclick = e => {
      e.stopPropagation();
      chrome.storage.local.set({ history: history.filter(x => x.url !== h.url) });
    };

    li.onclick = () => chrome.tabs.create({ url: h.url });
    li.append(img, info, del);
    list.append(li);
  }
  $('count').textContent = `${matches.length} of ${history.length} saved`;
}

$('search').addEventListener('input', render);
$('site').addEventListener('change', render);
$('clear').addEventListener('click', () => {
  if (confirm('Delete all saved history?')) chrome.storage.local.set({ history: [] });
});
chrome.storage.onChanged.addListener(changes => {
  if (changes.history) {
    history = changes.history.newValue || [];
    render();
  }
});
chrome.storage.local.get('history').then(r => {
  history = r.history || [];
  render();
});
