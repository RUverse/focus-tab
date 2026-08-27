import {
  loadSettings,
  onSettingsChanged,
  saveSettings,
  getFocusState,
  DISTRACTION_MIN_MINUTES,
  DISTRACTION_MAX_MINUTES,
  MAX_RECENT_REASONS
} from "./shared.js";
import { createSettingsPanel } from "./settings-panel.js";

const focusEl = document.getElementById("focus");
const focusStartBtn = document.getElementById("focusStart");
const distractionOpenBtn = document.getElementById("distractionOpen");
const distractionRemainingEl = document.getElementById("distractionRemaining");
const gearButton = document.getElementById("gearButton");

const blockModal = document.getElementById("blockModal");
const settingsPanelEl = document.getElementById("settingsPanel");
const settingsClose = document.getElementById("settingsClose");

const distractionModal = document.getElementById("distractionModal");
const distractionDialog = distractionModal.querySelector(".modal");
const breakMove = document.getElementById("breakMove");
const breakConsume = document.getElementById("breakConsume");
const breakChoices = breakMove.parentElement;
const afkClose = document.getElementById("afkClose");
const consumeBack = document.getElementById("consumeBack");
const dial = document.getElementById("dial");
const dialProgress = document.getElementById("dialProgress");
const dialHandle = document.getElementById("dialHandle");
const dialReadout = document.getElementById("dialReadout");
const reasonHistory = document.getElementById("reasonHistory");
const reasonInput = document.getElementById("reasonInput");
const reasonFeedback = document.getElementById("reasonFeedback");
const distractionCancel = document.getElementById("distractionCancel");
const distractionConfirm = document.getElementById("distractionConfirm");

const DIAL_CENTER = 120;
const DIAL_RADIUS = 96;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const MIN_REASON_LENGTH = 10;
const MIN_REASON_WORDS = 3;
const BREAK_DELAY_SECONDS = [5, 15, 120, 300, 600];

let settings = await loadSettings();
let selectedMinutes = 10;
let consumeDelayStartedAt = 0;
let consumeDelayTimer = null;

const settingsPanel = createSettingsPanel(settingsPanelEl, {
  getSettings: () => settings,
  isBlockLocked: (current) => getFocusState(current) === "focused",
  onAfterSave: (next) => {
    settings = next;
    render();
    renderSettingsModal();
  }
});

dialProgress.style.strokeDasharray = String(DIAL_CIRCUMFERENCE);

onSettingsChanged((next) => {
  settings = next;
  render();
  if (!blockModal.hidden) {
    renderSettingsModal();
  }
  if (!distractionModal.hidden) {
    syncConfirmEnabled();
  }
});

focusStartBtn.addEventListener("click", onFocusStart);
distractionOpenBtn.addEventListener("click", () => openDistractionModal());
gearButton.addEventListener("click", () => openBlockModal());

settingsClose.addEventListener("click", () => closeModal(blockModal));

distractionCancel.addEventListener("click", () => closeModal(distractionModal));
breakMove.addEventListener("click", () => setBreakStep("afk"));
breakConsume.addEventListener("click", () => setBreakStep("consume"));
afkClose.addEventListener("click", () => closeModal(distractionModal));
consumeBack.addEventListener("click", () => setBreakStep("choice"));
distractionConfirm.addEventListener("click", onConfirmDistraction);
reasonInput.addEventListener("input", syncConfirmEnabled);
reasonInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onConfirmDistraction();
  }
});
dial.addEventListener("pointerdown", onDialPointerDown);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal(blockModal);
    closeModal(distractionModal);
  }
});

[blockModal, distractionModal].forEach((modal) => {
  modal.addEventListener("pointerdown", (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });
});

render();
window.setInterval(render, 1000);

function render() {
  const now = Date.now();
  const state = getFocusState(settings, now);
  focusEl.dataset.state = state;

  if (state === "distracted") {
    distractionRemainingEl.textContent = formatRemaining(settings.distractionUntil - now);
  }
}

async function onFocusStart() {
  const state = getFocusState(settings);

  if (state === "distracted") {
    // "Focus" during a break ends the break and resumes blocking.
    await saveSettings({ distractionUntil: 0 });
    return;
  }

  // Idle: first run (no sites yet) opens the editor, otherwise start straight away.
  if (settings.blockList.length === 0) {
    openBlockModal("block");
    return;
  }

  await saveSettings({ focusActive: true, distractionUntil: 0 });
}

// --- Block list editor ---------------------------------------------------

function openBlockModal(tab = "general") {
  settingsPanel.setActiveTab(tab);
  renderSettingsModal();
  blockModal.hidden = false;
  settingsPanel.focusCurrentTab();
}

function renderSettingsModal() {
  settingsPanel.render(settings);
}

// --- Distraction (break) picker -----------------------------------------

function openDistractionModal() {
  setMinutes(selectedMinutes);
  reasonInput.value = "";
  consumeDelayStartedAt = 0;
  stopConsumeDelayTimer();
  syncConfirmEnabled();
  renderReasonHistory();
  distractionModal.hidden = false;
  setBreakStep("choice");
}

// Past reasons sit faded behind the dial — oldest at the top, the most recent
// nearest the input, so the list reads as a running history.
function renderReasonHistory() {
  reasonHistory.replaceChildren();
  [...settings.recentReasons].reverse().forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    reasonHistory.append(li);
  });
}

// The break modal is a small wizard: choose a break type, then either step away
// (AFK) or set up a timed "consume content" break.
function setBreakStep(step) {
  distractionDialog.dataset.step = step;

  if (step === "choice") {
    consumeDelayStartedAt = 0;
    stopConsumeDelayTimer();
    syncConfirmEnabled();
    randomizeBreakChoices();
    breakChoices.firstElementChild.focus();
  } else if (step === "consume") {
    startConsumeDelayTimer();
    reasonInput.focus();
  } else if (step === "afk") {
    consumeDelayStartedAt = 0;
    stopConsumeDelayTimer();
    syncConfirmEnabled();
    afkClose.focus();
  }
}

function randomizeBreakChoices() {
  const choices = [breakMove, breakConsume];
  if (Math.random() < 0.5) {
    choices.reverse();
  }
  breakChoices.replaceChildren(...choices);
}

// A break can only start after a clear reason and today's delay have both passed.
function syncConfirmEnabled() {
  const validation = validateBreakReason(reasonInput.value);
  const remainingSeconds = getConsumeDelayRemainingSeconds();
  const waiting = remainingSeconds > 0;

  if (!waiting) {
    stopConsumeDelayTimer();
  }

  distractionConfirm.disabled = !validation.valid || waiting;
  distractionConfirm.textContent = waiting ? `Wait ${formatDelay(remainingSeconds)}` : "Start break";

  let message = "";
  if (!validation.valid && reasonInput.value.trim()) {
    message = validation.message;
  } else if (waiting) {
    const breakNumber = getContentBreakCount() + 1;
    message = `Break ${breakNumber} today unlocks in ${formatDelay(remainingSeconds)}.`;
  }

  reasonFeedback.textContent = message;
  reasonFeedback.hidden = !message;
}

async function onConfirmDistraction() {
  const validation = validateBreakReason(reasonInput.value);
  if (!validation.valid || getConsumeDelayRemainingSeconds() > 0) {
    syncConfirmEnabled();
    return;
  }

  const reason = reasonInput.value.trim();
  // Keep the newest first, drop any duplicate of this reason, and cap the list.
  const recentReasons = [reason, ...settings.recentReasons.filter((item) => item !== reason)]
    .slice(0, MAX_RECENT_REASONS);
  const today = getTodayKey();
  const contentBreaksToday = {
    day: today,
    count: getContentBreakCount(today) + 1
  };

  await saveSettings({
    distractionUntil: Date.now() + selectedMinutes * 60000,
    recentReasons,
    contentBreaksToday
  });
  closeModal(distractionModal);
}

function startConsumeDelayTimer() {
  consumeDelayStartedAt = Date.now();
  stopConsumeDelayTimer();
  consumeDelayTimer = window.setInterval(syncConfirmEnabled, 250);
  syncConfirmEnabled();
}

function stopConsumeDelayTimer() {
  if (!consumeDelayTimer) {
    return;
  }

  window.clearInterval(consumeDelayTimer);
  consumeDelayTimer = null;
}

function validateBreakReason(value) {
  const reason = value.trim();
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

function looksLikeGibberish(reason) {
  const compact = reason.toLowerCase().replace(/[^a-z]/g, "");
  if (compact.length < 8) {
    return false;
  }

  if (/(.)\1{3,}/.test(compact)) {
    return true;
  }

  if (/(asdf|fdsa|qwer|rewq|zxcv|vcxz|jkl|lkj)/.test(compact)) {
    return true;
  }

  const vowels = compact.match(/[aeiou]/g) || [];
  const vowelRatio = vowels.length / compact.length;
  if (vowelRatio < 0.18 || vowelRatio > 0.72) {
    return true;
  }

  return /[bcdfghjklmnpqrstvwxyz]{5,}/.test(compact);
}

function onDialPointerDown(event) {
  event.preventDefault();
  setMinutes(minutesFromPointer(event));

  const move = (moveEvent) => setMinutes(minutesFromPointer(moveEvent));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function minutesFromPointer(event) {
  const rect = dial.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);

  let angle = Math.atan2(dx, -dy); // 0 at top, clockwise
  if (angle < 0) {
    angle += Math.PI * 2;
  }

  const fraction = angle / (Math.PI * 2);
  return clampMinutes(Math.round(fraction * DISTRACTION_MAX_MINUTES) || DISTRACTION_MIN_MINUTES);
}

function setMinutes(minutes) {
  selectedMinutes = clampMinutes(minutes);
  dialReadout.textContent = formatDuration(selectedMinutes);

  const fraction = selectedMinutes / DISTRACTION_MAX_MINUTES;
  dialProgress.style.strokeDashoffset = String(DIAL_CIRCUMFERENCE * (1 - fraction));

  const angle = fraction * Math.PI * 2;
  dialHandle.setAttribute("cx", String(DIAL_CENTER + DIAL_RADIUS * Math.sin(angle)));
  dialHandle.setAttribute("cy", String(DIAL_CENTER - DIAL_RADIUS * Math.cos(angle)));
}

function clampMinutes(minutes) {
  return Math.min(DISTRACTION_MAX_MINUTES, Math.max(DISTRACTION_MIN_MINUTES, Math.round(minutes)));
}

// --- Helpers -------------------------------------------------------------

function closeModal(modal) {
  modal.hidden = true;
  if (modal === distractionModal) {
    consumeDelayStartedAt = 0;
    stopConsumeDelayTimer();
    distractionConfirm.textContent = "Start break";
    reasonFeedback.hidden = true;
  }
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatRemaining(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function getConsumeDelayRemainingSeconds() {
  if (!consumeDelayStartedAt || !settings.contentBreakDelayEnabled) {
    return 0;
  }

  const delay = getBreakDelaySeconds(getContentBreakCount());
  const elapsed = (Date.now() - consumeDelayStartedAt) / 1000;
  return Math.max(0, Math.ceil(delay - elapsed));
}

function getBreakDelaySeconds(count) {
  return BREAK_DELAY_SECONDS[Math.min(count, BREAK_DELAY_SECONDS.length - 1)];
}

function getContentBreakCount(day = getTodayKey()) {
  const contentBreaks = settings.contentBreaksToday || {};
  return contentBreaks.day === day ? contentBreaks.count : 0;
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDelay(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
