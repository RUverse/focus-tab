import {
  MODES,
  QUOTES,
  loadSettings,
  onSettingsChanged,
  pickRandom,
  saveSettings
} from "./shared.js";

const root = document.getElementById("newtab");
const timeNode = document.getElementById("time");
const greetingNode = document.getElementById("greeting");
const dateNode = document.getElementById("date");
const quoteTextNode = document.getElementById("quoteText");
const quoteAuthorNode = document.getElementById("quoteAuthor");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
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

modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    settings = await saveSettings({ mode: button.dataset.mode });
    renderMode();
  });
});

document.addEventListener("keydown", async (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const keyMode = {
    d: "dark",
    l: "light"
  }[event.key.toLowerCase()];

  if (keyMode) {
    settings = await saveSettings({ mode: keyMode });
    renderMode();
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

render();
window.setInterval(renderClock, 1000);

function render() {
  renderMode();
  renderClock();
}

function renderMode() {
  root.classList.remove(...MODES.map((mode) => `mode-${mode}`));
  root.classList.add(`mode-${settings.mode}`);

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === settings.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  // Custom clock colour overrides the theme foreground; empty falls back to it.
  timeNode.style.color = settings.clockColor || "";

  // Progress bars track the clock colour so they read as part of the clock.
  progressBarsNode.hidden = !settings.showProgressBars;
  progressBarsNode.style.color = settings.clockColor || "";
  renderProgress();
}

function renderClock() {
  const now = new Date();
  const rawHour = now.getHours();
  const displayHour = settings.hour24 ? rawHour : rawHour % 12 || 12;
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const parts = settings.showSeconds ? [displayHour, minutes, seconds] : [displayHour, minutes];
  // Wrap each separator so it can be nudged to the vertical centre of the digits.
  timeNode.innerHTML = parts.join('<span class="time-dot">.</span>');

  greetingNode.textContent = `${getGreeting(rawHour)}, ${settings.name}`;
  dateNode.textContent = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;

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
