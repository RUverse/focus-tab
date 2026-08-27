import {
  QUOTES,
  applyGadgetScaleStyles,
  loadSettings,
  onSettingsChanged,
  pickRandom
} from "./shared.js";
import { formatDate } from "./date-format.js";

const root = document.getElementById("newtab");
const timeNode = document.getElementById("time");
const greetingNode = document.getElementById("greeting");
const dateNode = document.getElementById("date");
const quoteBlockNode = document.getElementById("quoteBlock");
const quoteTextNode = document.getElementById("quoteText");
const quoteAuthorNode = document.getElementById("quoteAuthor");
const progressBarsNode = document.getElementById("progressBars");
const progressBars = [
  { fill: document.getElementById("progressDay"), bar: document.getElementById("progressDayBar") },
  { fill: document.getElementById("progressMonth"), bar: document.getElementById("progressMonthBar") },
  { fill: document.getElementById("progressYear"), bar: document.getElementById("progressYearBar") }
];

// Active hours window used for the day progress bar: empty at 07:00 or earlier,
// full at 22:00 or later.
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;

let settings = await loadSettings();
let activeQuote = pickRandom(QUOTES);

quoteTextNode.textContent = activeQuote.text;
quoteAuthorNode.textContent = activeQuote.author;

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key === " " || event.key === "ArrowRight") {
    event.preventDefault();
    rotateQuote();
  }
});

onSettingsChanged((nextSettings) => {
  settings = nextSettings;
  render();
});

renderForLater();
render();
window.setInterval(renderClock, 1000);

// When this tab was parked here by the blocker, show what's waiting "for later".
// The original page comes back on its own once a break starts or focus ends.
function renderForLater() {
  const forLater = document.getElementById("forLater");
  const forLaterTitle = document.getElementById("forLaterTitle");
  const params = new URLSearchParams(window.location.search);

  const from = params.get("from");
  if (params.get("blocked") !== "1" || !from) {
    return;
  }

  const label = params.get("title") || hostFromUrl(from) || from;
  forLaterTitle.textContent = label;
  forLaterTitle.title = from;
  forLater.hidden = false;

  // Reflect the parked page in the tab title so blocked tabs are distinguishable
  // in the tab strip instead of all reading "Focus Clock".
  document.title = label;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// --- Now playing (media in other tabs) ----------------------------------
// Uses only the `tabs` permission: the `audible` flag plus each tab's title,
// favicon, and mute state. No host access or content scripts — so we can show
// and mute/focus playing tabs, but not read media metadata or pause playback.
const nowPlaying = document.getElementById("nowPlaying");
const nowPlayingList = document.getElementById("nowPlayingList");
const hasTabsApi = typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query;

if (hasTabsApi) {
  refreshNowPlaying();

  // Re-render when audio starts/stops, mute toggles, a title/icon changes, or
  // a playing tab is closed.
  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.audible !== undefined || info.mutedInfo || info.title || info.favIconUrl) {
      refreshNowPlaying();
    }
  });
  chrome.tabs.onRemoved.addListener(refreshNowPlaying);
}

async function refreshNowPlaying() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ audible: true });
  } catch {
    tabs = [];
  }

  nowPlayingList.replaceChildren(...tabs.map(buildNowPlayingItem));
  nowPlaying.hidden = tabs.length === 0;
}

function buildNowPlayingItem(tab) {
  const li = document.createElement("li");
  li.className = "now-playing-item";

  // Title + favicon: clicking switches to that tab.
  const open = document.createElement("button");
  open.type = "button";
  open.className = "np-open";
  open.title = tab.title || tab.url || "";
  open.addEventListener("click", () => focusTab(tab));

  const icon = document.createElement("img");
  icon.className = "np-icon";
  icon.alt = "";
  if (tab.favIconUrl) {
    icon.src = tab.favIconUrl;
  } else {
    icon.style.visibility = "hidden";
  }
  icon.addEventListener("error", () => {
    icon.style.visibility = "hidden";
  });

  const title = document.createElement("span");
  title.className = "np-title";
  title.textContent = tab.title || hostFromUrl(tab.url) || "Untitled";

  open.append(icon, title);

  const muted = Boolean(tab.mutedInfo && tab.mutedInfo.muted);
  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "np-mute";
  mute.textContent = muted ? "Unmute" : "Mute";
  mute.setAttribute("aria-pressed", String(muted));
  mute.addEventListener("click", () => {
    chrome.tabs.update(tab.id, { muted: !muted });
  });

  li.append(open, mute);
  return li;
}

function focusTab(tab) {
  chrome.tabs.update(tab.id, { active: true });
  if (typeof tab.windowId === "number" && chrome.windows) {
    chrome.windows.update(tab.windowId, { focused: true });
  }
}

function render() {
  renderMode();
  renderClock();
}

function renderMode() {
  applyGadgetScaleStyles(root, settings.gadgetScale);

  // Shape applies to the whole document (incl. modals, which live outside #newtab),
  // so the round-corner styles hang off <body> rather than the page root.
  document.body.classList.toggle("shape-round", settings.shape === "round");

  // Custom clock colour overrides the theme foreground; empty falls back to it.
  timeNode.style.color = settings.clockColor || "";

  // Progress bars track the clock colour so they read as part of the clock.
  progressBarsNode.hidden = !settings.showProgressBars;
  progressBarsNode.style.color = settings.clockColor || "";
  quoteBlockNode.hidden = !settings.motivationalQuoteEnabled;
  renderProgress();
}

function renderClock() {
  const now = new Date();
  const rawHour = now.getHours();
  const displayHour = settings.hour24 ? rawHour : rawHour % 12 || 12;
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const parts = settings.showSeconds ? [displayHour, minutes, seconds] : [displayHour, minutes];
  // Build the digits and separators as DOM nodes rather than an innerHTML
  // string: the values are clock numbers (never user input), but assigning
  // dynamic innerHTML trips AMO review and is needless here. Each separator is
  // its own span so it can be nudged to the vertical centre of the digits.
  timeNode.replaceChildren();
  parts.forEach((part, index) => {
    if (index > 0) {
      const dot = document.createElement("span");
      dot.className = "time-dot";
      dot.textContent = ".";
      timeNode.appendChild(dot);
    }
    timeNode.appendChild(document.createTextNode(String(part)));
  });

  greetingNode.textContent = `${getGreeting(rawHour)}, ${settings.name}`;
  dateNode.textContent = formatDate(now, settings.dateFormat);

  renderProgress(now);
}

function renderProgress(now = new Date()) {
  if (!settings.showProgressBars) {
    return;
  }

  // Day: fraction of the active 07:00–22:00 window elapsed so far.
  const decimalHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const dayPct = clamp01((decimalHour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR));

  // Month: fraction between the first and last day of the current month.
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPct = lastDay > 1 ? clamp01((now.getDate() - 1) / (lastDay - 1)) : 0;

  // Year: fraction of the twelve months reached so far.
  const yearPct = clamp01((now.getMonth() + 1) / 12);

  setProgress(progressBars[0], dayPct);
  setProgress(progressBars[1], monthPct);
  setProgress(progressBars[2], yearPct);
}

function setProgress({ fill, bar }, fraction) {
  const percent = Math.round(fraction * 100);
  fill.style.width = `${fraction * 100}%`;
  bar.setAttribute("aria-valuenow", String(percent));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function rotateQuote() {
  let nextQuote = pickRandom(QUOTES);

  if (QUOTES.length > 1) {
    while (nextQuote.text === activeQuote.text) {
      nextQuote = pickRandom(QUOTES);
    }
  }

  activeQuote = nextQuote;
  quoteTextNode.textContent = activeQuote.text;
  quoteAuthorNode.textContent = activeQuote.author;
}

function getGreeting(hour) {
  if (hour >= 5 && hour < 12) {
    return "Morning";
  }

  if (hour >= 12 && hour < 17) {
    return "Afternoon";
  }

  if (hour >= 17 && hour < 22) {
    return "Evening";
  }

  return "Night";
}

function pad(value) {
  return String(value).padStart(2, "0");
}
