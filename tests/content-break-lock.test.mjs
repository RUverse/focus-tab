import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMinutesOfDay,
  formatScheduleMoment,
  getContentBreakLockEnd,
  getNextContentBreakLockStart,
  normalizeContentBreakLock,
  normalizeSettings
} from "../shared.js";

// Local wall-clock times in the week of Monday 26 October 2026.
const at = (day, hour, minute = 0) => new Date(2026, 9, 26 + day, hour, minute).getTime();
const MON = 0, FRI = 4, SAT = 5, SUN = 6;
const weekdays = { enabled: true, days: [1, 2, 3, 4, 5], start: 8 * 60, end: 18 * 60 };

test("the lock is off by default and suggests weekday office hours", () => {
  assert.equal(new Date(at(MON, 9)).getDay(), 1);
  assert.deepEqual(normalizeSettings().contentBreakLock, { enabled: false, days: [1, 2, 3, 4, 5], start: 480, end: 1080 });
  assert.equal(getContentBreakLockEnd(normalizeSettings().contentBreakLock, at(MON, 9)), 0);
});

test("malformed lock storage falls back field by field", () => {
  assert.deepEqual(normalizeContentBreakLock("weekdays"), normalizeSettings().contentBreakLock);
  assert.deepEqual(
    normalizeContentBreakLock({ enabled: "yes", days: [5, 1, 1, 7, -1, 2.5, "3"], start: 1440, end: 600 }),
    { enabled: false, days: [1, 5], start: 480, end: 600 }
  );
  assert.deepEqual(normalizeSettings({ contentBreakLock: { ...weekdays, days: [] } }).contentBreakLock.days, []);
});

test("weekday hours lock from the start up to, not including, the end", () => {
  assert.equal(getContentBreakLockEnd(weekdays, at(MON, 7, 59)), 0);
  assert.equal(getContentBreakLockEnd(weekdays, at(MON, 8)), at(MON, 18));
  assert.equal(getContentBreakLockEnd(weekdays, at(FRI, 17, 59)), at(FRI, 18));
  assert.equal(getContentBreakLockEnd(weekdays, at(FRI, 18)), 0);
  assert.equal(getContentBreakLockEnd(weekdays, at(SAT, 9)), 0);
  assert.equal(getContentBreakLockEnd({ ...weekdays, enabled: false }, at(MON, 9)), 0);
  assert.equal(getContentBreakLockEnd({ ...weekdays, days: [] }, at(MON, 9)), 0);
});

test("an end before the start runs overnight into the next day", () => {
  const nights = { enabled: true, days: [5], start: 22 * 60, end: 6 * 60 };
  assert.equal(getContentBreakLockEnd(nights, at(FRI, 21)), 0);
  assert.equal(getContentBreakLockEnd(nights, at(FRI, 23)), at(SAT, 6));
  assert.equal(getContentBreakLockEnd(nights, at(SAT, 5)), at(SAT, 6));
  assert.equal(getContentBreakLockEnd(nights, at(SUN, 5)), 0);
});

test("equal times lock whole days and back-to-back days chain together", () => {
  const allDay = { enabled: true, days: [1, 2, 3, 4, 5], start: 0, end: 0 };
  assert.equal(getContentBreakLockEnd(allDay, at(MON + 1, 12)), at(SAT, 0));
  assert.equal(getContentBreakLockEnd(allDay, at(SUN, 12)), 0);
  assert.equal(getContentBreakLockEnd({ ...allDay, days: [0, 1, 2, 3, 4, 5, 6] }, at(SUN, 12)), Infinity);
});

test("the next lock start skips the weekend", () => {
  assert.equal(getNextContentBreakLockStart(weekdays, at(SAT, 12)), at(MON + 7, 8));
  assert.equal(getNextContentBreakLockStart(weekdays, at(MON, 7)), at(MON, 8));
  assert.equal(getNextContentBreakLockStart({ ...weekdays, days: [] }, at(MON, 7)), 0);
  assert.equal(getNextContentBreakLockStart({ ...weekdays, enabled: false }, at(MON, 7)), 0);
});

test("lock times read naturally in 12- and 24-hour formats", () => {
  assert.equal(formatMinutesOfDay(18 * 60), "6 PM");
  assert.equal(formatMinutesOfDay(8 * 60 + 30), "8:30 AM");
  assert.equal(formatMinutesOfDay(0), "12 AM");
  assert.equal(formatMinutesOfDay(12 * 60), "12 PM");
  assert.equal(formatMinutesOfDay(18 * 60, true), "18:00");
  assert.equal(formatScheduleMoment(at(MON, 18), at(MON, 9)), "at 6 PM");
  assert.equal(formatScheduleMoment(at(MON + 1, 8), at(MON, 19), true), "tomorrow at 08:00");
  assert.equal(formatScheduleMoment(at(MON + 7, 8), at(SAT, 12)), "on Monday at 8 AM");
});
