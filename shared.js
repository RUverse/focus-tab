export const MODES = ["dark", "light"];

// UI corner style: "boxy" (sharp corners) or "round" (border-radius everywhere).
export const SHAPES = ["boxy", "round"];

// Fidget toy shown in the corner: "off" hides it, the rest pick a toy.
export const FIDGETS = ["off", "spinner", "clicky"];

export const DISTRACTION_MIN_MINUTES = 1;
export const DISTRACTION_MAX_MINUTES = 240;

// Per-mode clock colour used when the user hasn't picked a custom one.
export const DEFAULT_CLOCK_COLORS = Object.freeze({ dark: "#d7d7d7", light: "#252525" });

export const DEFAULT_SETTINGS = Object.freeze({
  mode: "dark",
  shape: "boxy",
  name: "Friend",
  hour24: false,
  showSeconds: true,
  showProgressBars: false,
  clockColor: "",
  fidget: "off",
  // Where the user last dropped the fidget ({ x, y } in px from the top-left),
  // or null for the default bottom-left spot.
  fidgetPos: null,
  blockList: [],
  focusActive: false,
  distractionUntil: 0,
  contentBreakDelayEnabled: true,
  recentReasons: [],
  contentBreaksToday: {
    day: "",
    count: 0
  }
});

// How many past break reasons we keep around to show behind the picker.
export const MAX_RECENT_REASONS = 7;

export const QUOTES = Object.freeze([
  {
    text: "If you wait until you feel like doing something, you will likely never accomplish it.",
    author: "John C. Maxwell"
  },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain"
  },
  {
    text: "Action is the foundational key to all success.",
    author: "Pablo Picasso"
  },
  {
    text: "Do not wait. The time will never be just right.",
    author: "Napoleon Hill"
  },
  {
    text: "Great things are done by a series of small things brought together.",
    author: "Vincent van Gogh"
  },
  {
    text: "Well done is better than well said.",
    author: "Benjamin Franklin"
  },
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe"
  },
  {
    text: "The way to get started is to quit talking and begin doing.",
    author: "Walt Disney"
  },
  {
    text: "Focus on being productive instead of busy.",
    author: "Tim Ferriss"
  },
  {
    text: "Either you run the day or the day runs you.",
    author: "Jim Rohn"
  },
  {
    text: "Success is the sum of small efforts repeated day in and day out.",
    author: "Robert Collier"
  },
  {
    text: "The future depends on what you do today.",
    author: "Mahatma Gandhi"
  },
  {
    text: "You do not need more time. You need more focus.",
    author: "WHA"
  },
  {
    text: "Make it work, then make it better.",
    author: "WHA"
  },
  {
    text: "A finished draft beats a perfect intention.",
    author: "WHA"
  },
  {
    text: "Do the next useful thing.",
    author: "WHA"
  },
  {
    text: "Your calendar is a record of your priorities.",
    author: "WHA"
  },
  {
    text: "Momentum is built one honest hour at a time.",
    author: "WHA"
  }
]);

const STORAGE_KEY = "wha-newtab-settings";

export function normalizeSettings(settings = {}) {
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...settings
  };

  if (!MODES.includes(normalized.mode)) {
    normalized.mode = DEFAULT_SETTINGS.mode;
  }

  if (!SHAPES.includes(normalized.shape)) {
    normalized.shape = DEFAULT_SETTINGS.shape;
  }

  normalized.name = String(normalized.name || DEFAULT_SETTINGS.name).trim() || DEFAULT_SETTINGS.name;
  normalized.hour24 = Boolean(normalized.hour24);
  normalized.showSeconds = Boolean(normalized.showSeconds);
  normalized.showProgressBars = Boolean(normalized.showProgressBars);

  // Empty string means "follow the theme default"; otherwise keep a valid hex.
  const color = String(normalized.clockColor || "").trim().toLowerCase();
  normalized.clockColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(color) ? color : "";

  if (!FIDGETS.includes(normalized.fidget)) {
    normalized.fidget = DEFAULT_SETTINGS.fidget;
  }

  const pos = normalized.fidgetPos;
  normalized.fidgetPos =
    pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))
      ? { x: Number(pos.x), y: Number(pos.y) }
      : null;

  const hosts = Array.isArray(normalized.blockList) ? normalized.blockList : [];
  normalized.blockList = [...new Set(hosts.map(normalizeHost).filter(Boolean))];

  normalized.focusActive = Boolean(normalized.focusActive);

  const until = Number(normalized.distractionUntil);
  normalized.distractionUntil = Number.isFinite(until) && until > 0 ? until : 0;
  normalized.contentBreakDelayEnabled = normalized.contentBreakDelayEnabled !== false;

  const reasons = Array.isArray(normalized.recentReasons) ? normalized.recentReasons : [];
  normalized.recentReasons = reasons
    .map((reason) => String(reason || "").trim())
    .filter(Boolean)
    .slice(0, MAX_RECENT_REASONS);

  const contentBreaks = normalized.contentBreaksToday || {};
  const contentBreakDay = String(contentBreaks.day || "");
  const contentBreakCount = Number(contentBreaks.count);
  normalized.contentBreaksToday = {
    day: /^\d{4}-\d{2}-\d{2}$/.test(contentBreakDay) ? contentBreakDay : "",
    count: Number.isFinite(contentBreakCount) && contentBreakCount > 0 ? Math.floor(contentBreakCount) : 0
  };

  return normalized;
}

// Turn loose user input ("X.com", "https://www.x.com/path") into a bare,
// lowercased registrable host ("x.com") suitable for declarativeNetRequest
// requestDomains (which also matches subdomains).
export function normalizeHost(input) {
  if (typeof input !== "string") {
    return "";
  }

  let host = input.trim().toLowerCase();
  if (!host) {
    return "";
  }

  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host : `http://${host}`).hostname;
  } catch {
    host = host.replace(/^[a-z]+:\/\//, "").split("/")[0];
  }

  host = host.replace(/^www\./, "").split(":")[0];

  return host.includes(".") ? host : "";
}

// Derive the active focus phase from settings + current time.
export function getFocusState(settings, now = Date.now()) {
  if (!settings || !settings.focusActive) {
    return "idle";
  }

  if (settings.distractionUntil && settings.distractionUntil > now) {
    return "distracted";
  }

  return "focused";
}

// Blocking is enforced only while focused and not on a break.
export function isBlockingActive(settings, now = Date.now()) {
  return getFocusState(settings, now) === "focused" && settings.blockList.length > 0;
}

export async function loadSettings() {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, (items) => resolve(normalizeSettings(items)));
    });
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeSettings(saved);
  } catch {
    return normalizeSettings();
  }
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = normalizeSettings({
    ...current,
    ...patch
  });

  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set(next, () => resolve(next));
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("wha-settings-changed", { detail: next }));
  return next;
}

export function onSettingsChanged(callback) {
  if (hasChromeStorage() && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (_changes, area) => {
      if (area !== "local") {
        return;
      }

      callback(await loadSettings());
    });
    return;
  }

  window.addEventListener("wha-settings-changed", (event) => {
    callback(normalizeSettings(event.detail));
  });
}

export function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage && chrome.storage.local);
}
