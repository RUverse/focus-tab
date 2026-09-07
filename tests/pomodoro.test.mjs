import assert from "node:assert/strict";
import test from "node:test";
import { getPomodoroState, normalizeSettings, pomodoroDuration } from "../shared.js";

const focus = 25 * 60 * 1000;
const rest = 5 * 60 * 1000;

test("malformed Pomodoro timer settings recover", () => {
  for (const value of [undefined, null, "bad", { phase: "unknown", remainingMs: -1, endsAt: Infinity }]) {
    const settings = normalizeSettings({ pomodoro: value, pomodoroEnabled: "false", pomodoroPos: { x: NaN, y: 2 } });
    assert.equal(settings.pomodoroEnabled, false);
    assert.equal(settings.pomodoroPos, null);
    assert.deepEqual(settings.pomodoro, { phase: "focus", remainingMs: focus, endsAt: 0 });
  }
  assert.equal(normalizeSettings({ pomodoro: { phase: "break", remainingMs: focus } }).pomodoro.remainingMs, rest);
});

test("running countdown uses elapsed wall time, including after reload or suspension", () => {
  const stored = { phase: "focus", remainingMs: focus, endsAt: 1000 + focus };
  assert.equal(getPomodoroState(stored, 61000).remainingMs, focus - 60000);
  assert.equal(getPomodoroState(JSON.parse(JSON.stringify(stored)), 121000).remainingMs, focus - 120000);
});

test("each expired interval cues the next phase, paused, even after a long absence", () => {
  for (const [phase, next, duration] of [["focus", "break", rest], ["break", "focus", focus]]) {
    const stored = { phase, remainingMs: pomodoroDuration(phase), endsAt: 1000 };
    for (const now of [1000, 100000000]) {
      assert.deepEqual(getPomodoroState(stored, now), { phase: next, remainingMs: duration, endsAt: 0 });
    }
    assert.equal(stored.phase, phase);
  }
});

test("pausing preserves time and resuming creates a new deadline", () => {
  const running = getPomodoroState({ phase: "focus", remainingMs: focus, endsAt: focus + 1000 }, 31000);
  const paused = { ...running, endsAt: 0 };
  assert.equal(getPomodoroState(paused, 999000).remainingMs, focus - 30000);
  const resumed = { ...paused, endsAt: 999000 + paused.remainingMs };
  assert.equal(getPomodoroState(resumed, 1000000).remainingMs, focus - 31000);
});
