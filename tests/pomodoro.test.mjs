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
    assert.deepEqual(settings.pomodoro, { phase: "focus", remainingMs: focus, endsAt: 0, completedSessions: 0 });
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
      assert.deepEqual(getPomodoroState(stored, now), { phase: next, remainingMs: duration, endsAt: 0, completedSessions: phase === "focus" ? 1 : 0 });
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

test("session goals and legacy or malformed counts normalize safely", () => {
  assert.equal(normalizeSettings({}).pomodoroSessionGoal, 6);
  for (const value of [null, "8", 2.5, Infinity]) {
    assert.equal(normalizeSettings({ pomodoroSessionGoal: value }).pomodoroSessionGoal, 6);
  }
  assert.equal(normalizeSettings({ pomodoroSessionGoal: 0 }).pomodoroSessionGoal, 1);
  assert.equal(normalizeSettings({ pomodoroSessionGoal: 99 }).pomodoroSessionGoal, 24);
  for (const completedSessions of [undefined, -1, 1.5, "3", Infinity]) {
    assert.equal(getPomodoroState({ completedSessions }).completedSessions, 0);
  }
});

test("completed focus counts once across repeated reads, reloads and the following break", () => {
  const stored = { phase: "focus", remainingMs: focus, endsAt: 1000, completedSessions: 5 };
  const completed = getPomodoroState(stored, 2000);
  assert.equal(completed.completedSessions, 6);
  assert.deepEqual(getPomodoroState(stored, 3000), completed);
  assert.deepEqual(getPomodoroState(JSON.parse(JSON.stringify(completed)), 4000), completed);
  const breakDone = getPomodoroState({ ...completed, endsAt: 5000 }, 6000);
  assert.equal(breakDone.completedSessions, 6);
  assert.equal(breakDone.phase, "focus");
});
