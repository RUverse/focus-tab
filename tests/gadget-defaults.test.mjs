import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings } from "../shared.js";

test("fresh settings enable all three gadgets but keep them hidden", () => {
  const settings = normalizeSettings();
  assert.equal(settings.fidget, "spinner");
  assert.equal(settings.stickyNoteListEnabled, true);
  assert.equal(settings.pomodoroEnabled, true);
  for (const key of ["fidgetHidden", "stickyNoteListHidden", "pomodoroHidden"]) {
    assert.equal(settings[key], true);
  }
  assert.equal(settings.pomodoro.endsAt, 0);
});

test("new gadget defaults preserve explicit disabled and visible preferences", () => {
  const saved = {
    fidget: "off", stickyNoteListEnabled: false, pomodoroEnabled: false,
    fidgetHidden: false, stickyNoteListHidden: false, pomodoroHidden: false
  };
  const settings = normalizeSettings(saved);
  for (const [key, value] of Object.entries(saved)) assert.equal(settings[key], value);
  assert.equal(normalizeSettings({ fidget: "clicky" }).fidget, "clicky");
});
