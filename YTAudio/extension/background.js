// Runs downloads for the popup: sends the URL to the native helper (yt-dlp)
// and tracks progress per URL. The open port keeps this worker alive.
const HOST = 'com.lggpl.ytaudio';
const jobs = new Map(); // url -> { status: 'running' | 'done' | 'error', progress, file, error }

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'get') reply(jobs.get(msg.url) || null);
  if (msg.type === 'download') {
    start(msg.url);
    reply(jobs.get(msg.url));
  }
});

function start(url) {
  if (jobs.get(url)?.status === 'running') return;
  update(url, { status: 'running', progress: '' });

  const port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(m => {
    if (m.progress) update(url, { status: 'running', progress: m.progress });
    if (m.done) update(url, { status: 'done', file: m.file });
    if (m.error) update(url, { status: 'error', error: m.error });
  });
  port.onDisconnect.addListener(() => {
    if (jobs.get(url)?.status === 'running') {
      update(url, { status: 'error', error: chrome.runtime.lastError?.message || 'helper disconnected' });
    }
  });
  port.postMessage({ url });
}

function update(url, job) {
  jobs.set(url, job);
  const running = [...jobs.values()].filter(j => j.status === 'running');
  chrome.action.setBadgeText({ text: running.length ? running[0].progress || '...' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#1f6feb' });
  chrome.runtime.sendMessage({ type: 'job', url, job }).catch(() => {}); // popup may be closed
}
