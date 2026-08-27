import { loadSettings, onSettingsChanged } from "./shared.js";
import { createSettingsPanel } from "./settings-panel.js";

const settingsPanelEl = document.getElementById("settingsPanel");

let settings = await loadSettings();

const settingsPanel = createSettingsPanel(settingsPanelEl, {
  getSettings: () => settings,
  onAfterSave: (next) => {
    settings = next;
    render();
  }
});

onSettingsChanged((nextSettings) => {
  settings = nextSettings;
  render();
});

render();

function render() {
  document.body.classList.toggle("shape-round", settings.shape === "round");
  settingsPanel.render(settings);
}
