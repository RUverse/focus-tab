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
const periodNode = document.getElementById("period");
const greetingNode = document.getElementById("greeting");
const dateNode = document.getElementById("date");
const quoteTextNode = document.getElementById("quoteText");
const quoteAuthorNode = document.getElementById("quoteAuthor");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));

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

  periodNode.textContent = settings.hour24 ? "" : rawHour >= 12 ? "PM" : "AM";
  greetingNode.textContent = `${getGreeting(rawHour)}, ${settings.name}`;
  dateNode.textContent = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
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
