import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeGibberish, validateBreakReason } from "../break-reason.js";

test("ordinary sentences are accepted as break reasons", () => {
  for (const reason of [
    "distracting myself from my pain",
    "checking my schedule for tomorrow",
    "reading about strengths and weaknesses",
    "watching a rhythm and blues video",
    "going to the gym after this",
    "checking news again",
    "need to reply to my friend's message"
  ]) {
    assert.deepEqual(validateBreakReason(reason), { valid: true, message: "" }, reason);
  }
});

test("letters across word boundaries never form a consonant cluster", () => {
  assert.equal(looksLikeGibberish("distracting myself from my pain"), false);
  assert.equal(looksLikeGibberish("watch something strange"), false);
});

test("keyboard mashing is still rejected", () => {
  for (const reason of [
    "asdf asdf asdf",
    "qwerty uiop stuff",
    "sdfghjk lorem words",
    "aaaaaa bbbb cccc",
    "xkcdbrtz mnpqrst vwxz"
  ]) {
    assert.equal(validateBreakReason(reason).valid, false, reason);
    assert.equal(validateBreakReason(reason).message, "Use real words, not random keystrokes.", reason);
  }
});

test("short or sparse reasons get the specific message", () => {
  assert.equal(validateBreakReason("bored").message, "Write a clearer reason.");
  assert.equal(validateBreakReason("just bored now").valid, true);
  assert.equal(validateBreakReason("procrastinating").message, "Use at least three words.");
  assert.equal(validateBreakReason(undefined).message, "Write a clearer reason.");
});
