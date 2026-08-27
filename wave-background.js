import { createWaveConfig, mountWave } from "@ruverse/waves";
import { getSystemColorScheme, loadSettings, onSettingsChanged } from "./shared.js";
import { decodeWaveConfigStrict } from "./wave-config.js";

const PRESET_SOURCES = Object.freeze([
  {
    id: "soft-arc",
    label: "Soft Arc",
    compact: "waves:v1:{\"a\":-5,\"w\":0.003939884261804551,\"f\":0.8267371048929455,\"p\":0.083,\"r\":89,\"c\":0.44,\"sp\":0.9205794337135311,\"th\":20,\"tp\":0.5684922322219599,\"n\":4}"
  },
  {
    id: "glitched",
    label: "Glitched",
    compact: "waves:v1:{\"s\":84396.72168342143,\"a\":24,\"w\":0.03361151230767119,\"p\":0.018183012280900246,\"r\":-1,\"c\":0.11,\"g\":0.18,\"sp\":1.1,\"th\":13.5,\"tp\":0.45,\"n\":6}"
  },
  {
    id: "mood",
    label: "Mood",
    compact: "waves:v1:{\"a\":22,\"w\":0.015317250349878696,\"f\":0.44538349461762444,\"p\":0.011822287744481831,\"r\":-40.80293507293088,\"c\":0.71,\"sp\":1.3714668541386854,\"th\":6,\"tp\":0.9486903633979757,\"n\":9,\"wc\":\"#1d5543ff\",\"bg\":\"#1f163eff\"}"
  },
  {
    id: "signal-bloom",
    label: "Signal Bloom",
    compact: "waves:v1:{\"s\":404,\"a\":70,\"w\":0.009,\"f\":0.85,\"p\":0.006,\"r\":-72,\"c\":0.15,\"g\":0.025,\"sp\":0.38,\"th\":2,\"tp\":0.35,\"n\":9,\"bg\":\"transparent\",\"v\":{\"a\":0.2,\"w\":0.04,\"f\":0.14,\"p\":0.04,\"r\":0.02,\"c\":0.08,\"sp\":0.09,\"th\":0.06}}"
  }
]);

export const WAVE_PRESETS = Object.freeze(PRESET_SOURCES.map((preset) => Object.freeze({
  ...preset,
  config: decodeWaveConfigStrict(preset.compact)
})));

const PRESETS_BY_ID = new Map(WAVE_PRESETS.map((preset) => [preset.id, preset]));
export const THEME_WAVE_COLORS = Object.freeze({
  light: "rgba(37, 37, 37, 0.08)",
  dark: "rgba(215, 215, 215, 0.10)"
});

let currentSettings = null;

function resolvePreset(selection) {
  return PRESETS_BY_ID.get(selection) || PRESETS_BY_ID.get("mood");
}

export function resolveWaveBackground(settings, options = {}) {
  const selection = settings?.waveBackground;
  if (selection === "off") {
    return { config: null, error: null, sourceId: "off" };
  }

  const colorScheme = options.colorScheme === "dark" ? "dark" : "light";
  const waveColor = THEME_WAVE_COLORS[colorScheme];
  let sourceConfig;
  let sourceId = selection;
  let error = null;

  if (selection === "custom") {
    try {
      sourceConfig = decodeWaveConfigStrict(settings?.customWaveConfig);
    } catch (caught) {
      const fallback = PRESETS_BY_ID.get("mood");
      sourceConfig = fallback.config;
      sourceId = fallback.id;
      error = caught instanceof Error ? caught.message : "The custom wave config is invalid.";
    }
  } else {
    const preset = resolvePreset(selection);
    sourceConfig = preset.config;
    sourceId = preset.id;
  }

  return {
    // Shared configs provide deterministic shape and motion. Focus Tab keeps
    // every canvas transparent and supplies readable system-theme wave colors.
    config: createWaveConfig({
      ...sourceConfig,
      backgroundColor: "transparent",
      waveColor
    }),
    error,
    sourceId
  };
}

export function createWaveBackgroundController(options = {}) {
  const mount = options.mount || mountWave;
  const getColorScheme = options.getColorScheme || getSystemColorScheme;
  let waveHandle = null;

  return {
    render(container, settings) {
      const resolved = resolveWaveBackground(settings, {
        colorScheme: getColorScheme()
      });

      if (!resolved.config) {
        waveHandle?.destroy();
        waveHandle = null;
        return resolved;
      }

      if (waveHandle) {
        waveHandle.update(resolved.config);
      } else {
        waveHandle = mount(container, resolved.config);
      }

      return resolved;
    },

    destroy() {
      waveHandle?.destroy();
      waveHandle = null;
    }
  };
}

const backgroundController = createWaveBackgroundController();

async function initialize() {
  const container = document.getElementById("waveBackground");
  if (!container) return;

  currentSettings = await loadSettings();
  backgroundController.render(container, currentSettings);
  onSettingsChanged((settings) => {
    currentSettings = settings;
    backgroundController.render(container, settings);
  });

  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentSettings) backgroundController.render(container, currentSettings);
  });
}

if (typeof document !== "undefined") {
  void initialize();
}
