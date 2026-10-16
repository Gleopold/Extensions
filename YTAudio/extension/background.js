// Sends the current YouTube URL to the native helper (yt-dlp) and shows
// progress on the toolbar badge. The open port keeps this worker alive.
const HOST = 'com.lggpl.ytaudio';
const YT = /^https:\/\/((www|m|music)\.)?youtube\.com\/(watch|shorts\/|live\/)|^https:\/\/youtu\.be\//;
const active = new Set();

chrome.action.onClicked.addListener(tab => {
  const url = tab?.url || '';
  if (!YT.test(url)) return badge('?', '#b35900', 'Open a YouTube video first');
  if (active.has(url)) return;
  active.add(url);

  let finished = false;
  const port = chrome.runtime.connectNative(HOST);
  badge('...', '#555', `Starting: ${url}`);

  port.onMessage.addListener(m => {
    if (m.progress) badge(m.progress, '#1f6feb', `Downloading ${m.progress}`);
    if (m.done) {
      finished = true;
      badge('OK', '#1a7f37', `Saved: ${m.file}`);
    }
    if (m.error) {
      finished = true;
      badge('ERR', '#cf222e', `Failed: ${m.error}`);
    }
  });

  port.onDisconnect.addListener(() => {
    active.delete(url);
    if (!finished) badge('ERR', '#cf222e', `Helper failed: ${chrome.runtime.lastError?.message || 'disconnected'}`);
  });

  port.postMessage({ url });
});

function badge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: `YouTube Audio Download\n${title}` });
}
