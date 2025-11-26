let lastActivity = Date.now();
const idleThreshold = 120000; // 2 minutes

function reportActive() {
  lastActivity = Date.now();
  chrome.runtime.sendMessage({ type: 'activity', active: true });
}

['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(eventType => {
  document.addEventListener(eventType, reportActive, { passive: true });
});

setInterval(() => {
  if (Date.now() - lastActivity > idleThreshold) {
    chrome.runtime.sendMessage({ type: 'activity', active: false });
  }
}, 5000);

window.addEventListener('beforeunload', () => {
  try {
    if (navigator.sendBeacon) navigator.sendBeacon('about:blank');
  } catch (err) {
    // best effort
  }
  chrome.runtime.sendMessage({ type: 'force_save' });
});
