export const MODES = ["dark", "light"];

export const DEFAULT_SETTINGS = Object.freeze({
  mode: "dark",
  name: "Friend",
  hour24: false,
  showSeconds: true
});

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

  normalized.name = String(normalized.name || DEFAULT_SETTINGS.name).trim() || DEFAULT_SETTINGS.name;
  normalized.hour24 = Boolean(normalized.hour24);
  normalized.showSeconds = Boolean(normalized.showSeconds);

  return normalized;
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
