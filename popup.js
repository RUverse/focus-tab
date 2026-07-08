import { MODES, loadSettings, onSettingsChanged } from "./shared.js";
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
  settingsPanel.render(settings);
  document.body.dataset.mode = MODES.includes(settings.mode) ? settings.mode : "dark";
}
