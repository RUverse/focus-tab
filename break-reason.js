// Validation for the reason a user gives before starting a distraction break.
// The goal is to stop keyboard mashing, not to judge wording, so every check
// errs on the side of accepting ordinary sentences.

export const MIN_REASON_LENGTH = 10;
export const MIN_REASON_WORDS = 3;

// Longest consonant run allowed inside one word. English words reach five
// ("strengths", "latchstring"), so only six or more counts as mashing.
const MAX_WORD_CONSONANT_RUN = 5;

export function validateBreakReason(value) {
  const reason = String(value ?? "").trim();
  const words = reason.match(/[a-z0-9]+(?:['-][a-z0-9]+)?/gi) || [];

  if (reason.length < MIN_REASON_LENGTH) {
    return { valid: false, message: "Write a clearer reason." };
  }

  if (words.length < MIN_REASON_WORDS) {
    return { valid: false, message: "Use at least three words." };
  }

  if (looksLikeGibberish(reason)) {
    return { valid: false, message: "Use real words, not random keystrokes." };
  }

  return { valid: true, message: "" };
}

export function looksLikeGibberish(reason) {
  const lower = String(reason ?? "").toLowerCase();
  const compact = lower.replace(/[^a-z]/g, "");
  if (compact.length < 8) {
    return false;
  }

  if (/(.)\1{3,}/.test(compact)) {
    return true;
  }

  // Check keyboard runs and consonant clusters per word so letters at the
  // end of one word and the start of the next ("distracting myself") never
  // combine into a false match.
  const words = lower.match(/[a-z]+/g) || [];
  if (words.some((word) => /(asdf|fdsa|qwer|rewq|zxcv|vcxz|jkl|lkj)/.test(word))) {
    return true;
  }

  // "y" acts as a vowel in words such as "my", "rhythm", and "gym".
  const vowels = compact.match(/[aeiouy]/g) || [];
  const vowelRatio = vowels.length / compact.length;
  if (vowelRatio < 0.18 || vowelRatio > 0.72) {
    return true;
  }

  const consonantRun = new RegExp(`[bcdfghjklmnpqrstvwxz]{${MAX_WORD_CONSONANT_RUN + 1},}`);
  return words.some((word) => consonantRun.test(word));
}
