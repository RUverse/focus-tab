import { createWaveConfig, mountWave } from "@ruverse/waves";
import { loadSettings, onSettingsChanged } from "./shared.js";

const COMMON = Object.freeze({
  backgroundColor: "transparent",
  glitch: 0,
  vertexStep: 5
});

export const WAVE_PRESETS = Object.freeze([
  {
    id: "quiet-current",
    label: "Quiet Current",
    config: {
      ...COMMON,
      seed: 101,
      amplitude: 38,
      wavelength: 0.018,
      frequency: 0.25,
      period: 0.012,
      rotation: 0,
      curvature: 0.04,
      spacing: 0.62,
      thickness: 2,
      taper: 0.12,
      waveCount: 5,
      variations: {
        amplitude: 0.12,
        wavelength: 0.04,
        frequency: 0.08,
        period: 0.04,
        rotation: 0.01,
        curvature: 0.04,
        spacing: 0.05,
        thickness: 0.04
      }
    }
  },
  {
    id: "soft-arc",
    label: "Soft Arc",
    config: {
      ...COMMON,
      seed: 202,
      amplitude: 56,
      wavelength: 0.012,
      frequency: 0.6,
      period: -0.008,
      rotation: -18,
      curvature: 0.22,
      spacing: 0.48,
      thickness: 2.5,
      taper: 0.25,
      waveCount: 7,
      variations: {
        amplitude: 0.18,
        wavelength: 0.05,
        frequency: 0.12,
        period: 0.05,
        rotation: 0.025,
        curvature: 0.07,
        spacing: 0.08,
        thickness: 0.05
      }
    }
  },
  {
    id: "diagonal-drift",
    label: "Diagonal Drift",
    config: {
      ...COMMON,
      seed: 303,
      amplitude: 28,
      wavelength: 0.026,
      frequency: 0.1,
      period: 0.018,
      rotation: 58,
      curvature: -0.08,
      spacing: 0.72,
      thickness: 1.5,
      taper: 0,
      waveCount: 6,
      variations: {
        amplitude: 0.1,
        wavelength: 0.035,
        frequency: 0.06,
        period: 0.03,
        rotation: 0.018,
        curvature: 0.05,
        spacing: 0.06,
        thickness: 0.03
      }
    }
  },
  {
    id: "signal-bloom",
    label: "Signal Bloom",
    config: {
      ...COMMON,
      seed: 404,
      amplitude: 70,
      wavelength: 0.009,
      frequency: 0.85,
      period: 0.006,
      rotation: -72,
      curvature: 0.15,
      glitch: 0.025,
      spacing: 0.38,
      thickness: 2,
      taper: 0.35,
      waveCount: 9,
      variations: {
        amplitude: 0.2,
        wavelength: 0.04,
        frequency: 0.14,
        period: 0.04,
        rotation: 0.02,
        curvature: 0.08,
        spacing: 0.09,
        thickness: 0.06
      }
    }
  }
]);

const PRESETS_BY_ID = new Map(WAVE_PRESETS.map((preset) => [preset.id, preset]));
const randomPresetId = pickRandomPresetId();
let waveHandle = null;

function pickRandomPresetId() {
  let value;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    value = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  } else {
    value = Math.random();
  }
  return WAVE_PRESETS[Math.floor(value * WAVE_PRESETS.length)].id;
}

function resolvePreset(selection) {
  const id = selection === "random" ? randomPresetId : selection;
  return PRESETS_BY_ID.get(id) || PRESETS_BY_ID.get("quiet-current");
}

function renderWaveBackground(container, settings) {
  if (settings.waveBackground === "off") {
    waveHandle?.destroy();
    waveHandle = null;
    return;
  }

  const preset = resolvePreset(settings.waveBackground);
  const waveColor = settings.mode === "light"
    ? "rgba(37, 37, 37, 0.08)"
    : "rgba(215, 215, 215, 0.10)";
  const config = createWaveConfig({ ...preset.config, waveColor });

  if (waveHandle) waveHandle.update(config);
  else waveHandle = mountWave(container, config);
}

async function initialize() {
  const container = document.getElementById("waveBackground");
  if (!container) return;

  renderWaveBackground(container, await loadSettings());
  onSettingsChanged((settings) => renderWaveBackground(container, settings));
}

if (typeof document !== "undefined") {
  void initialize();
}
