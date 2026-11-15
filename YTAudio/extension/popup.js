const $ = id => document.getElementById(id);
let url = null;
let savedFile = null;

function render(job) {
  const running = job?.status === 'running';
  savedFile = job?.status === 'done' ? job.file : null;
  $('download').disabled = !url || running;
  $('download').textContent = running ? 'Downloading…' : savedFile ? 'Show in folder' : 'Download';
  $('cancel').hidden = !running;
  $('cancel').disabled = !!job?.cancelling;
  $('format').disabled = $('quality').disabled = running;
  $('update').hidden = job?.status !== 'error';
  $('bar').hidden = !running;
  if (running) {
    job.pct == null || job.stage || job.cancelling ? $('bar').removeAttribute('value') : ($('bar').value = job.pct);
  }
  const status = $('status');
  status.className = job?.status || '';
  status.textContent =
    running ? runningText(job) :
    job?.status === 'done' ? `Saved: ${job.file}` :
    job?.status === 'error' ? `Failed: ${job.error}` :
    job?.status === 'cancelled' ? 'Cancelled.' : '';
}

function runningText(job) {
  if (job.cancelling) return 'Cancelling…';
  if (job.stage) return `${job.stage}…`;
  if (job.pct == null) return 'Starting…';
  return [
    job.part ? `${job.part[0].toUpperCase()}${job.part.slice(1)} ${job.pct}%` : `${job.pct}%`,
    job.speed,
    job.eta && `${job.eta} left`,
  ].filter(Boolean).join(' · ');
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'job' && msg.url === url) render(msg.job);
});

$('download').addEventListener('click', async () => {
  if (savedFile) {
    chrome.runtime.sendMessage({ type: 'open', file: savedFile });
    return window.close();
  }
  render(await chrome.runtime.sendMessage({ type: 'download', url, format: $('format').value, quality: $('quality').value }));
});

$('cancel').addEventListener('click', async () => {
  render(await chrome.runtime.sendMessage({ type: 'cancel', url }));
});

$('update').addEventListener('click', async () => {
  $('update').disabled = true;
  $('status').className = '';
  $('status').textContent = 'Updating yt-dlp…';
  const result = await chrome.runtime.sendMessage({ type: 'update' });
  $('update').disabled = false;
  $('update').hidden = !!result?.ok;
  $('status').className = result?.ok ? 'done' : 'error';
  $('status').textContent = result?.ok ? `${result.message} Try the download again.` : `Update failed: ${result?.message}`;
});

// Remember the chosen format between popups. Picking another format after a
// finished download offers a fresh download instead of "Show in folder".
const VIDEO = ['mp4', 'mkv', 'webm'];
for (const [id, fallback] of [['format', 'mp4'], ['quality', 'best']]) {
  try { $(id).value = localStorage.getItem(id) || fallback; } catch {}
  if (!$(id).value) $(id).value = fallback; // stored value no longer exists
  $(id).addEventListener('change', () => {
    try { localStorage.setItem(id, $(id).value); } catch {}
    $('qualityRow').hidden = !VIDEO.includes($('format').value);
    if (savedFile) render(null);
  });
}
$('qualityRow').hidden = !VIDEO.includes($('format').value);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https?:\/\//.test(tab?.url || '')) {
    $('title').textContent = 'Open a page with a video (YouTube and most other sites) to download it.';
    return;
  }
  url = tab.url;
  $('title').textContent = (tab.title || url).replace(/ - YouTube$/, '');
  render(await chrome.runtime.sendMessage({ type: 'get', url }));
})();
