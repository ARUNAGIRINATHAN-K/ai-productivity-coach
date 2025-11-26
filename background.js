let currentTabId = null;
let currentDomain = null;
let startTime = null;
let active = true;

function handlePromise(promise, context) {
  if (promise && typeof promise.then === 'function') {
    promise.catch(err => console.error(context, err));
  }
}

function getDomainFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return null;
  if (url.startsWith('chrome-extension://')) return null;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch (err) {
    return null;
  }
}

function getUsage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['usage'], data => resolve(data.usage || {}));
  });
}

function setUsage(usage) {
  return new Promise(resolve => {
    chrome.storage.local.set({ usage }, resolve);
  });
}

async function saveTimeForDomain(domain, seconds) {
  if (!domain || seconds <= 0) return;
  const usage = await getUsage();
  usage[domain] = (usage[domain] || 0) + seconds;
  await setUsage(usage);
}

async function persistActiveTime({ keepTracking = false } = {}) {
  if (!currentDomain || !startTime) return;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  if (elapsed > 0) {
    await saveTimeForDomain(currentDomain, elapsed);
  }

  if (keepTracking && active && currentDomain) {
    startTime = Date.now();
  } else {
    startTime = null;
  }
}

async function trackActiveTab(tabId, url) {
  const domain = getDomainFromUrl(url);

  if (currentTabId === tabId && currentDomain === domain) {
    if (active && domain && !startTime) startTime = Date.now();
    return;
  }

  await persistActiveTime();

  currentTabId = tabId;
  currentDomain = domain;
  startTime = domain && active ? Date.now() : null;
}

function initCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs.length) {
      currentTabId = null;
      currentDomain = null;
      startTime = null;
      return;
    }

    const tab = tabs[0];
    handlePromise(trackActiveTab(tab.id, tab.url), 'trackActiveTab:init');
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['usage'], data => {
    if (!data.usage) chrome.storage.local.set({ usage: {} });
  });
  initCurrentTab();
});

chrome.runtime.onStartup.addListener(() => {
  initCurrentTab();
});

chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (chrome.runtime.lastError || !tab) return;
    handlePromise(trackActiveTab(tab.id, tab.url), 'trackActiveTab:onActivated');
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.active) return;
  if (changeInfo.status === 'complete' || changeInfo.url) {
    handlePromise(
      trackActiveTab(tabId, changeInfo.url || tab.url),
      'trackActiveTab:onUpdated'
    );
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId !== currentTabId) return;
  handlePromise(persistActiveTime(), 'persistActiveTime:onRemoved');
  currentTabId = null;
  currentDomain = null;
  startTime = null;
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (!active) return;
    active = false;
    handlePromise(persistActiveTime(), 'persistActiveTime:onFocusLost');
  } else if (!active) {
    active = true;
    if (currentDomain) startTime = Date.now();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'activity') {
    if (msg.active && !active) {
      active = true;
      if (currentDomain) startTime = Date.now();
    } else if (!msg.active && active) {
      active = false;
      handlePromise(persistActiveTime(), 'persistActiveTime:activityInactive');
    }
  }

  if (msg.type === 'force_save') {
    handlePromise(
      persistActiveTime({ keepTracking: true }),
      'persistActiveTime:forceSave'
    );
  }
});

setInterval(() => {
  if (!active || !currentDomain || !startTime) return;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  if (elapsed >= 15) {
    handlePromise(
      persistActiveTime({ keepTracking: true }),
      'persistActiveTime:interval'
    );
  }
}, 15000);

initCurrentTab();
