// Runs downloads for the popup: sends the URL to the native helper (yt-dlp)
// and tracks progress per URL. The open port keeps this worker alive.
const HOST = 'com.lggpl.ytaudio';
const jobs = new Map();  // url -> { status: 'running' | 'done' | 'error' | 'cancelled', pct, speed, eta, part, stage, file, error }
const ports = new Map(); // url -> native port of the running download

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'get') reply(jobs.get(msg.url) || null);
  if (msg.type === 'download') {
    start(msg.url, msg.format, msg.quality);
    reply(jobs.get(msg.url));
  }
  if (msg.type === 'cancel') {
    cancel(msg.url);
    reply(jobs.get(msg.url) || null);
  }
  if (msg.type === 'open') chrome.runtime.sendNativeMessage(HOST, { open: msg.file });
  if (msg.type === 'update') {
    chrome.runtime.sendNativeMessage(HOST, { update: true }, r =>
      reply(r || { ok: false, message: chrome.runtime.lastError?.message || 'helper did not answer' }));
    return true; // reply is asynchronous
  }
});

function start(url, format, quality) {
  if (jobs.get(url)?.status === 'running') return;
  update(url, { status: 'running' });

  const port = chrome.runtime.connectNative(HOST);
  ports.set(url, port);
  const finish = job => {
    if (ports.get(url) === port) ports.delete(url);
    update(url, job);
  };
  port.onMessage.addListener(m => {
    const cancelling = jobs.get(url)?.cancelling; // keep the flag while late progress still arrives
    if (m.progress) update(url, { status: 'running', cancelling, pct: Number(m.progress), speed: m.speed, eta: m.eta, part: m.part });
    if (m.stage) update(url, { status: 'running', cancelling, stage: m.stage });
    if (m.done) finish({ status: 'done', file: m.file });
    if (m.error) finish({ status: 'error', error: m.error });
    if (m.cancelled) finish({ status: 'cancelled' });
  });
  port.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message;
    if (ports.get(url) !== port) return; // already finished
    const cancelling = jobs.get(url)?.cancelling;
    finish(cancelling ? { status: 'cancelled' } : { status: 'error', error: message || 'helper disconnected' });
  });
  port.postMessage({ url, format, quality });
}

function cancel(url) {
  const port = ports.get(url);
  const job = jobs.get(url);
  if (!port || job?.status !== 'running') return;
  update(url, { ...job, cancelling: true });
  port.postMessage({ cancel: true });
  // If the helper never confirms, closing the port stops it too.
  setTimeout(() => {
    if (ports.get(url) !== port) return;
    ports.delete(url);
    port.disconnect();
    update(url, { status: 'cancelled' });
  }, 5000);
}

function update(url, job) {
  jobs.set(url, job);
  const running = [...jobs.values()].filter(j => j.status === 'running');
  const first = running[0];
  chrome.action.setBadgeText({ text: !first ? '' : first.pct != null && !first.stage ? `${first.pct}%` : '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#1f6feb' });
  chrome.runtime.sendMessage({ type: 'job', url, job }).catch(() => {}); // popup may be closed
}
