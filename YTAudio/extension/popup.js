const YT = /^https:\/\/((www|m|music)\.)?youtube\.com\/(watch|shorts\/|live\/)|^https:\/\/youtu\.be\//;
const $ = id => document.getElementById(id);
let url = null;
let savedFile = null;

function render(job) {
  const running = job?.status === 'running';
  savedFile = job?.status === 'done' ? job.file : null;
  $('download').disabled = !url || running;
  $('download').textContent = running ? 'Downloading…' : savedFile ? 'Show in folder' : 'Download audio';
  $('bar').hidden = !running;
  if (running) {
    const pct = parseInt(job.progress, 10);
    Number.isNaN(pct) ? $('bar').removeAttribute('value') : ($('bar').value = pct);
  }
  const status = $('status');
  status.className = job?.status || '';
  status.textContent =
    job?.status === 'running' ? (job.progress ? `${job.progress} downloaded` : 'Starting…') :
    job?.status === 'done' ? `Saved: ${job.file}` :
    job?.status === 'error' ? `Failed: ${job.error}` : '';
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'job' && msg.url === url) render(msg.job);
});

$('download').addEventListener('click', async () => {
  if (savedFile) {
    chrome.runtime.sendNativeMessage('com.lggpl.ytaudio', { open: savedFile });
    return window.close();
  }
  render(await chrome.runtime.sendMessage({ type: 'download', url }));
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!YT.test(tab?.url || '')) {
    $('title').textContent = 'Open a YouTube video to download its audio.';
    return;
  }
  url = tab.url;
  $('title').textContent = (tab.title || url).replace(/ - YouTube$/, '');
  render(await chrome.runtime.sendMessage({ type: 'get', url }));
})();
