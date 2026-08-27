import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_WAVE_CONFIG_MAX_LENGTH,
  DEFAULT_SETTINGS,
  WAVE_BACKGROUNDS,
  normalizeSettings
} from "../shared.js";
import {
  canonicalizeWaveConfig,
  decodeWaveConfigStrict,
  parseWaveConfig
} from "../wave-config.js";
import {
  THEME_WAVE_COLORS,
  WAVE_PRESETS,
  createWaveBackgroundController,
  resolveWaveBackground
} from "../wave-background.js";

const CUSTOM_SOURCE = ` waves:v1:{"n":7,"s":4242,"a":52,"w":0.021,"f":0.4,"p":0.015,"r":17,"c":0.12,"g":0.03,"sp":0.55,"th":2.5,"tp":0.2,"vs":4,"wc":"#123456","bg":"#abcdef","v":{"a":0.2,"w":0.1,"f":0.3,"p":0.4,"r":0.5,"c":0.6,"sp":0.7,"th":0.8}} `;

test("wave settings expose the new curated inventory and default", () => {
  assert.equal(DEFAULT_SETTINGS.waveBackground, "mood");
  assert.equal(DEFAULT_SETTINGS.customWaveConfig, "");
  assert.equal(normalizeSettings({}).waveBackground, "mood");
  assert.equal(normalizeSettings({}).customWaveConfig, "");
  assert.equal(normalizeSettings({ name: "Legacy" }).customWaveConfig, "");
  assert.equal(normalizeSettings({ waveBackground: "custom" }).waveBackground, "custom");
  assert.equal(normalizeSettings({ waveBackground: "unknown" }).waveBackground, "mood");
  assert.equal("mode" in normalizeSettings({ mode: "dark" }), false);
});

test("custom config storage normalization trims, coerces, and caps values", () => {
  assert.equal(normalizeSettings({ customWaveConfig: "  waves:v1:{}  " }).customWaveConfig, "waves:v1:{}");
  assert.equal(normalizeSettings({ customWaveConfig: 42 }).customWaveConfig, "42");
  assert.equal(normalizeSettings({ customWaveConfig: null }).customWaveConfig, "");

  const normalized = normalizeSettings({ customWaveConfig: `  ${"x".repeat(5000)}  ` });
  assert.equal(normalized.customWaveConfig.length, CUSTOM_WAVE_CONFIG_MAX_LENGTH);
  assert.equal(normalized.customWaveConfig, "x".repeat(CUSTOM_WAVE_CONFIG_MAX_LENGTH));
});

test("settings choices contain every curated preset and Custom exactly once", () => {
  const presetIds = WAVE_PRESETS.map((preset) => preset.id);
  assert.deepEqual(WAVE_BACKGROUNDS, ["off", ...presetIds, "custom"]);
  assert.deepEqual(presetIds, ["soft-arc", "glitched", "mood", "signal-bloom"]);
  assert.equal(new Set(WAVE_BACKGROUNDS).size, WAVE_BACKGROUNDS.length);
  assert.equal(new Set(presetIds).size, 4);

  for (const preset of WAVE_PRESETS) {
    assert.deepEqual(preset.config, decodeWaveConfigStrict(preset.compact));
    assert.ok(Number.isFinite(preset.config.seed));
    assert.ok(preset.config.waveCount >= 1 && preset.config.waveCount <= 30);

    const rendered = resolveWaveBackground(
      { waveBackground: preset.id, customWaveConfig: "" },
      { colorScheme: "light" }
    );
    assert.equal(rendered.sourceId, preset.id);
    assert.equal(rendered.config.backgroundColor, "transparent");
    assert.equal(rendered.config.waveColor, THEME_WAVE_COLORS.light);
    assert.equal(rendered.config.amplitude, preset.config.amplitude);
    assert.equal(rendered.config.seed, preset.config.seed);
  }

  assert.equal(WAVE_PRESETS[0].config.amplitude, -5);
  assert.equal(WAVE_PRESETS[1].config.glitch, 0.18);
  assert.equal(WAVE_PRESETS[2].config.waveColor, "#1d5543ff");
  assert.equal(WAVE_PRESETS[2].config.backgroundColor, "#1f163eff");
  assert.equal(WAVE_PRESETS[3].config.seed, 404);
  assert.equal(WAVE_PRESETS[3].config.glitch, 0.025);
});

test("valid compact input canonicalizes and round-trips deterministic fields", () => {
  const parsed = parseWaveConfig(CUSTOM_SOURCE);
  assert.equal(parsed.canonical, canonicalizeWaveConfig(CUSTOM_SOURCE));
  assert.ok(parsed.canonical.startsWith("waves:v1:"));
  assert.equal(parsed.canonical, parsed.canonical.trim());
  assert.deepEqual(decodeWaveConfigStrict(parsed.canonical), parsed.config);

  assert.equal(parsed.config.seed, 4242);
  assert.equal(parsed.config.amplitude, 52);
  assert.equal(parsed.config.wavelength, 0.021);
  assert.equal(parsed.config.frequency, 0.4);
  assert.equal(parsed.config.period, 0.015);
  assert.equal(parsed.config.rotation, 17);
  assert.equal(parsed.config.curvature, 0.12);
  assert.equal(parsed.config.glitch, 0.03);
  assert.equal(parsed.config.spacing, 0.55);
  assert.equal(parsed.config.thickness, 2.5);
  assert.equal(parsed.config.taper, 0.2);
  assert.equal(parsed.config.waveCount, 7);
  assert.equal(parsed.config.vertexStep, 4);
  assert.deepEqual(parsed.config.variations, {
    amplitude: 0.2,
    wavelength: 0.1,
    frequency: 0.3,
    period: 0.4,
    rotation: 0.5,
    curvature: 0.6,
    spacing: 0.7,
    thickness: 0.8
  });
});

test("invalid, unsupported, malformed, and corrupted compact strings are rejected", () => {
  const invalid = [
    "not-a-wave-config",
    "waves:v2:{}",
    "waves:v1:{",
    "waves:v1:[]",
    "waves:v1:{\"unknown\":1}",
    "waves:v1:{\"s\":\"broken\"}"
  ];

  for (const candidate of invalid) {
    assert.throws(() => decodeWaveConfigStrict(candidate), TypeError);
    assert.throws(() => canonicalizeWaveConfig(candidate), TypeError);
  }
});

test("Custom rendering preserves the decoded config and owns theme colors", () => {
  const customWaveConfig = canonicalizeWaveConfig(CUSTOM_SOURCE);
  const decoded = decodeWaveConfigStrict(customWaveConfig);
  const light = resolveWaveBackground(
    { waveBackground: "custom", customWaveConfig },
    { colorScheme: "light" }
  );
  const dark = resolveWaveBackground(
    { waveBackground: "custom", customWaveConfig },
    { colorScheme: "dark" }
  );

  for (const key of [
    "seed", "amplitude", "wavelength", "frequency", "period", "rotation",
    "curvature", "glitch", "spacing", "thickness", "taper", "waveCount", "vertexStep"
  ]) {
    assert.equal(light.config[key], decoded[key], key);
    assert.equal(dark.config[key], decoded[key], key);
  }
  assert.deepEqual(light.config.variations, decoded.variations);
  assert.deepEqual(dark.config.variations, decoded.variations);
  assert.equal(light.config.backgroundColor, "transparent");
  assert.equal(dark.config.backgroundColor, "transparent");
  assert.equal(light.config.waveColor, THEME_WAVE_COLORS.light);
  assert.equal(dark.config.waveColor, THEME_WAVE_COLORS.dark);
  assert.equal(light.error, null);
  assert.equal(dark.error, null);
});

test("corrupted persisted Custom state falls back safely without settings loss", () => {
  const stored = normalizeSettings({
    name: "Still here",
    waveBackground: "custom",
    customWaveConfig: " waves:v9:{broken} "
  });
  const resolved = resolveWaveBackground(stored, { colorScheme: "light" });

  assert.equal(stored.name, "Still here");
  assert.equal(stored.waveBackground, "custom");
  assert.equal(stored.customWaveConfig, "waves:v9:{broken}");
  assert.equal(resolved.sourceId, "mood");
  assert.match(resolved.error, /invalid|unsupported/i);
  assert.deepEqual(
    resolved.config,
    resolveWaveBackground(
      { waveBackground: "mood", customWaveConfig: "" },
      { colorScheme: "light" }
    ).config
  );

  const empty = resolveWaveBackground(
    { waveBackground: "custom", customWaveConfig: "" },
    { colorScheme: "dark" }
  );
  assert.equal(empty.sourceId, "mood");
  assert.ok(empty.error);
});

test("Off, presets, theme changes, and repeated updates keep one live handle", () => {
  let scheme = "light";
  let liveHandles = 0;
  let maxLiveHandles = 0;
  let mountCount = 0;
  let updateCount = 0;
  let destroyCount = 0;
  const configs = [];

  const controller = createWaveBackgroundController({
    getColorScheme: () => scheme,
    mount: (_container, config) => {
      mountCount += 1;
      liveHandles += 1;
      maxLiveHandles = Math.max(maxLiveHandles, liveHandles);
      configs.push(config);
      let destroyed = false;
      return {
        update(nextConfig) {
          assert.equal(destroyed, false);
          updateCount += 1;
          configs.push(nextConfig);
        },
        destroy() {
          if (!destroyed) {
            destroyed = true;
            destroyCount += 1;
            liveHandles -= 1;
          }
        }
      };
    }
  });

  const container = {};
  const softArc = { waveBackground: "soft-arc", customWaveConfig: "" };
  assert.equal(controller.render(container, softArc).sourceId, "soft-arc");
  assert.equal(controller.render(container, softArc).sourceId, "soft-arc");
  assert.deepEqual(configs[0], configs[1]);

  assert.equal(
    controller.render(container, { waveBackground: "glitched", customWaveConfig: "" }).sourceId,
    "glitched"
  );
  scheme = "dark";
  controller.render(container, { waveBackground: "glitched", customWaveConfig: "" });
  assert.equal(configs.at(-1).waveColor, THEME_WAVE_COLORS.dark);

  controller.render(container, { waveBackground: "off", customWaveConfig: "" });
  controller.render(container, { waveBackground: "off", customWaveConfig: "" });
  assert.equal(liveHandles, 0);

  controller.render(container, { waveBackground: "mood", customWaveConfig: "" });
  assert.equal(mountCount, 2);
  assert.equal(updateCount, 3);
  assert.equal(destroyCount, 1);
  assert.equal(liveHandles, 1);
  assert.equal(maxLiveHandles, 1);

  controller.destroy();
  assert.equal(liveHandles, 0);
  assert.equal(destroyCount, 2);
});
