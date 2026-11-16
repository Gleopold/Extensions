const $ = id => document.getElementById(id);
let url = null;
let savedFile = null;

function render(job) {
  const running = job?.status === 'running';
  savedFile = job?.status === 'done' ? job.file : null;
  $('download').disabled = !url || running;
  $('download').textContent = running ? 'Downloading…' : 'Download'; // always there, also after a finished download
  $('open').hidden = !savedFile;
  $('cancel').hidden = !running;
  $('cancel').disabled = !!job?.cancelling;
  $('format').disabled = $('quality').disabled = running;
  $('update').hidden = job?.status !== 'error';
  $('cookies').hidden = !(job?.status === 'error' && job.needsCookies);
  $('bar').hidden = !running;
  if (running) {
    job.pct == null || job.stage || job.cancelling ? $('bar').removeAttribute('value') : ($('bar').value = job.pct);
  }
  const status = $('status');
  status.className = job?.status || '';
  status.textContent =
    running ? runningText(job) :
    job?.status === 'done' ? `Saved: ${job.file}` :
    job?.status === 'error' ? `Failed: ${job.error}${job.needsCookies
      ? '\n\nThe site may be asking for a captcha or login. Solve it on the page in this tab, then retry with your browser session.' : ''}` :
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

// Opens the download folder in Explorer with the saved file selected.
$('open').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open', file: savedFile });
  window.close();
});

$('download').addEventListener('click', async () => {
  render(await chrome.runtime.sendMessage({ type: 'download', url, format: $('format').value, quality: $('quality').value }));
});

// Retry using this tab's cookies, so the captcha or login already done in the browser counts.
// The site permission is asked once per site, only when this button is used.
$('cookies').addEventListener('click', async () => {
  const origins = [`${new URL(url).origin}/*`];
  try {
    if (!(await chrome.permissions.contains({ origins })) && !(await chrome.permissions.request({ origins }))) {
      $('status').className = 'error';
      $('status').textContent = "Failed: permission to use this site's cookies was not granted.";
      return;
    }
  } catch (e) {
    $('status').className = 'error';
    $('status').textContent = `Failed: ${e.message}`;
    return;
  }
  render(await chrome.runtime.sendMessage({
    type: 'download', url, format: $('format').value, quality: $('quality').value, withCookies: true,
  }));
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

// Remember the chosen format and quality between popups.
const VIDEO = ['mp4', 'mkv', 'webm'];
for (const [id, fallback] of [['format', 'mp4'], ['quality', 'best']]) {
  try { $(id).value = localStorage.getItem(id) || fallback; } catch {}
  if (!$(id).value) $(id).value = fallback; // stored value no longer exists
  $(id).addEventListener('change', () => {
    try { localStorage.setItem(id, $(id).value); } catch {}
    $('qualityRow').hidden = !VIDEO.includes($('format').value);
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
