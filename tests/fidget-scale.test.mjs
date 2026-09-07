import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, applyFidgetScaleStyles } from "../shared.js";

test("fidget scale defaults to 2 and preserves legacy scale preferences", () => {
  assert.equal(normalizeSettings().fidgetScale, 2);
  assert.equal(normalizeSettings({ gadgetScale: 3 }).fidgetScale, 3);
  assert.equal(normalizeSettings({ gadgetScale: 3, fidgetScale: 1.5 }).fidgetScale, 1.5);
  assert.equal('gadgetScale' in normalizeSettings({ gadgetScale: 3 }), false);
  assert.equal(normalizeSettings({ fidgetScale: 'bad' }).fidgetScale, 2);
  assert.equal(normalizeSettings({ fidgetScale: 8 }).fidgetScale, 4);
  assert.equal(normalizeSettings({ fidgetScale: -1 }).fidgetScale, 1);
});

test("fidget scaling does not write note or timer styles", () => {
  const properties = {};
  applyFidgetScaleStyles({ style: { setProperty(key, value) { properties[key] = value; } } }, 2);
  assert.deepEqual(properties, { '--fidget-size': '144px', '--fidget-spinner-size': '224px' });
});
