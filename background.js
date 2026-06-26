import { loadSettings, saveSettings, isBlockingActive, getFocusState } from "./shared.js";

const DISTRACTION_ALARM = "focus-distraction-end";
const FOCUS_PAGE = chrome.runtime.getURL("newtab.html");

// The focus page a blocked tab is sent to, carrying the original URL so the tab
// can be returned to it once blocking lifts (break started, or focus ended).
function blockedUrlFor(originalUrl) {
  return `${FOCUS_PAGE}?blocked=1&from=${encodeURIComponent(originalUrl)}`;
}

let reconciling = false;
let reconcileQueued = false;

async function reconcile() {
  // Serialize: storage writes here can re-trigger reconcile, so collapse
  // overlapping runs into a single follow-up pass.
  if (reconciling) {
    reconcileQueued = true;
    return;
  }

  reconciling = true;
  try {
    const settings = await loadSettings();
    const now = Date.now();

    // A break that has elapsed should fall back to focused mode. Persisting the
    // cleared timestamp triggers another reconcile that re-enables blocking.
    if (settings.focusActive && settings.distractionUntil && settings.distractionUntil <= now) {
      await saveSettings({ distractionUntil: 0 });
      return;
    }

    await syncAlarm(settings, now);

    if (isBlockingActive(settings, now)) {
      await sweepOpenTabs(settings, now);
    } else {
      await restoreBlockedTabs();
    }
  } finally {
    reconciling = false;
    if (reconcileQueued) {
      reconcileQueued = false;
      reconcile();
    }
  }
}

// When focus turns on (or a break ends) redirect any matching tabs that are
// already open — including background tabs that never fire a fresh navigation.
async function sweepOpenTabs(settings, now) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    blockTab(tab.id, tab.url, settings, now);
  }
}

// When blocking lifts, send every tab parked on the focus page back to the site
// it was blocked from (the original URL travels in the `from` query param).
async function restoreBlockedTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.url.startsWith(FOCUS_PAGE)) {
      continue;
    }

    const from = new URL(tab.url).searchParams.get("from");
    if (from) {
      chrome.tabs.update(tab.id, { url: from }).catch(() => {});
    }
  }
}

async function syncAlarm(settings, now) {
  await chrome.alarms.clear(DISTRACTION_ALARM);

  if (getFocusState(settings, now) === "distracted") {
    chrome.alarms.create(DISTRACTION_ALARM, { when: settings.distractionUntil });
  }
}

// Send a single tab to the focus page if it points at a blocked site.
function blockTab(tabId, url, settings, now) {
  if (typeof tabId !== "number" || !isBlockingActive(settings, now)) {
    return;
  }

  if (hostIsBlocked(url, settings.blockList)) {
    chrome.tabs.update(tabId, { url: blockedUrlFor(url) }).catch(() => {});
  }
}

// True when `url`'s host is, or is a subdomain of, any blocked host.
// Matches every path on the site (e.g. x.com, x.com/home, m.x.com/feed).
function hostIsBlocked(url, blockList) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return false;
  }

  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  host = host.replace(/^www\./, "");
  return blockList.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

// Catch fresh navigations before the page loads.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) {
    return;
  }

  const settings = await loadSettings();
  blockTab(details.tabId, details.url, settings, Date.now());
});

// Catch switching to an already-loaded blocked tab.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const [settings, tab] = await Promise.all([loadSettings(), chrome.tabs.get(tabId).catch(() => null)]);
  if (tab) {
    blockTab(tabId, tab.url || tab.pendingUrl, settings, Date.now());
  }
});

// Catch in-tab URL changes (SPA-style or omnibox edits that reuse the tab).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }

  const settings = await loadSettings();
  blockTab(tabId, changeInfo.url, settings, Date.now());
});

chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    reconcile();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DISTRACTION_ALARM) {
    reconcile();
  }
});

// Reconcile on worker spin-up so state survives a service-worker restart.
reconcile();
