import assert from "node:assert/strict";
import test from "node:test";

import { formatDate } from "../date-format.js";
import {
  DATE_FORMAT_MAX_LENGTH,
  DEFAULT_DATE_FORMAT,
  DEFAULT_SETTINGS,
  normalizeSettings
} from "../shared.js";

test("date format defaults to a full weekday, month, and day", () => {
  assert.equal(DEFAULT_DATE_FORMAT, "dddd, MMMM D");
  assert.equal(DEFAULT_SETTINGS.dateFormat, DEFAULT_DATE_FORMAT);
  assert.equal(normalizeSettings({}).dateFormat, DEFAULT_DATE_FORMAT);
  assert.equal(normalizeSettings({ dateFormat: "" }).dateFormat, DEFAULT_DATE_FORMAT);
});

test("date format storage is trimmed, sanitized, and length-limited", () => {
  assert.equal(normalizeSettings({ dateFormat: "  dddd, MMMM D  " }).dateFormat, "dddd, MMMM D");
  assert.equal(normalizeSettings({ dateFormat: "DD\nMM\tYYYY" }).dateFormat, "DD MM YYYY");
  assert.equal(normalizeSettings({ dateFormat: 2026 }).dateFormat, "2026");
  assert.equal(
    normalizeSettings({ dateFormat: "D".repeat(DATE_FORMAT_MAX_LENGTH + 20) }).dateFormat,
    "D".repeat(DATE_FORMAT_MAX_LENGTH)
  );
});

test("Moment.js formats custom tokens and bracketed literals", () => {
  const date = new Date(2026, 7, 27, 12, 0, 0);

  assert.equal(formatDate(date, "DD-MM-YYYY"), "27-08-2026");
  assert.equal(formatDate(date, "dddd, MMMM D, YYYY"), "Thursday, August 27, 2026");
  assert.equal(formatDate(date, "[Today is] dddd"), "Today is Thursday");
});
