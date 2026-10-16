// Injects content.js into every frame, then turns fitting on in the frame
// holding the best video (or off everywhere if it's already on).
chrome.action.onClicked.addListener(tab => tab?.id && toggle(tab.id));

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.fvw === 'off' && sender.tab?.id) turnOff(sender.tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') setBadge(tabId, '');
});

function run(tabId, func, frameIds) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  return chrome.scripting.executeScript({ target, func });
}

async function toggle(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    const frames = (await run(tabId, () => window.__fvw?.status())).filter(r => r.result);

    if (frames.some(r => r.result.on)) return turnOff(tabId);

    const best = frames.filter(r => r.result.score > 0).sort((a, b) => b.result.score - a.result.score)[0];
    if (!best) return setBadge(tabId, '?');

    await run(tabId, () => window.__fvw.fit(), [best.frameId]);
    setBadge(tabId, 'ON');
  } catch (e) {
    console.warn('Fit Video Width:', e);
    setBadge(tabId, 'ERR');
  }
}

async function turnOff(tabId) {
  try {
    await run(tabId, () => window.__fvw?.off());
  } catch (e) {
    console.warn('Fit Video Width:', e);
  }
  setBadge(tabId, '');
}

function setBadge(tabId, text) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: text === 'ON' ? '#1a7f37' : '#b35900' });
}
