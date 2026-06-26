import { MODES, loadSettings, onSettingsChanged, saveSettings } from "./shared.js";

const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const nameInput = document.getElementById("nameInput");
const hour24Input = document.getElementById("hour24Input");
const showSecondsInput = document.getElementById("showSecondsInput");

let settings = await loadSettings();
let nameSaveTimer = 0;

modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    settings = await saveSettings({ mode: button.dataset.mode });
    render();
  });
});

nameInput.addEventListener("input", () => {
  window.clearTimeout(nameSaveTimer);
  const value = nameInput.value;
  nameSaveTimer = window.setTimeout(() => persistName(value), 180);
});

nameInput.addEventListener("change", () => {
  persistName(nameInput.value);
});

nameInput.addEventListener("blur", () => {
  persistName(nameInput.value);
});

hour24Input.addEventListener("change", async () => {
  settings = await saveSettings({ hour24: hour24Input.checked });
  render();
});

showSecondsInput.addEventListener("change", async () => {
  settings = await saveSettings({ showSeconds: showSecondsInput.checked });
  render();
});

onSettingsChanged((nextSettings) => {
  settings = nextSettings;
  render();
});

render();

function render() {
  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === settings.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  nameInput.value = settings.name;
  hour24Input.checked = settings.hour24;
  showSecondsInput.checked = settings.showSeconds;

  document.body.dataset.mode = MODES.includes(settings.mode) ? settings.mode : "dark";
}

async function persistName(value) {
  window.clearTimeout(nameSaveTimer);
  settings = await saveSettings({ name: value });
  render();
}
