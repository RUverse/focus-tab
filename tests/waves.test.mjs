import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  WAVE_BACKGROUNDS,
  normalizeSettings
} from "../shared.js";
import { WAVE_PRESETS } from "../wave-background.js";

test("wave background settings default and normalize safely", () => {
  assert.equal(DEFAULT_SETTINGS.waveBackground, "quiet-current");
  assert.equal(normalizeSettings({}).waveBackground, "quiet-current");
  assert.equal(normalizeSettings({ waveBackground: "random" }).waveBackground, "random");
  assert.equal(normalizeSettings({ waveBackground: "unknown" }).waveBackground, "quiet-current");
  assert.equal("mode" in normalizeSettings({ mode: "dark" }), false);
});

test("settings choices and committed presets stay in sync", () => {
  const presetIds = WAVE_PRESETS.map((preset) => preset.id);
  assert.deepEqual(WAVE_BACKGROUNDS, ["off", "random", ...presetIds]);
  assert.equal(new Set(presetIds).size, 4);

  for (const preset of WAVE_PRESETS) {
    assert.equal(preset.config.backgroundColor, "transparent");
    assert.ok(Number.isFinite(preset.config.seed));
    assert.ok(preset.config.waveCount >= 1 && preset.config.waveCount <= 30);
  }
});
