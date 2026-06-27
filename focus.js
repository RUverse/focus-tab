import {
  loadSettings,
  onSettingsChanged,
  saveSettings,
  normalizeHost,
  getFocusState,
  DISTRACTION_MIN_MINUTES,
  DISTRACTION_MAX_MINUTES,
  DEFAULT_CLOCK_COLORS,
  MAX_RECENT_REASONS
} from "./shared.js";

const focusEl = document.getElementById("focus");
const focusStartBtn = document.getElementById("focusStart");
const distractionOpenBtn = document.getElementById("distractionOpen");
const distractionRemainingEl = document.getElementById("distractionRemaining");
const gearButton = document.getElementById("gearButton");

const blockModal = document.getElementById("blockModal");
const blockForm = document.getElementById("blockForm");
const blockInput = document.getElementById("blockInput");
const blockListEl = document.getElementById("blockListEl");
const blockEmpty = document.getElementById("blockEmpty");
const blockPrimary = document.getElementById("blockPrimary");
const blockCancel = document.getElementById("blockCancel");
const blockSection = document.getElementById("blockSection");
const blockLock = document.getElementById("blockLock");
const blockUndo = document.getElementById("blockUndo");
const clockFormatButtons = Array.from(document.querySelectorAll("[data-hour24]"));
const progressButtons = Array.from(document.querySelectorAll("[data-progress]"));
const shapeButtons = Array.from(document.querySelectorAll("[data-shape]"));
const clockColorInput = document.getElementById("clockColorInput");
const clockColorReset = document.getElementById("clockColorReset");

const distractionModal = document.getElementById("distractionModal");
const distractionDialog = distractionModal.querySelector(".modal");
const breakMove = document.getElementById("breakMove");
const breakConsume = document.getElementById("breakConsume");
const afkClose = document.getElementById("afkClose");
const consumeBack = document.getElementById("consumeBack");
const dial = document.getElementById("dial");
const dialProgress = document.getElementById("dialProgress");
const dialHandle = document.getElementById("dialHandle");
const dialReadout = document.getElementById("dialReadout");
const reasonHistory = document.getElementById("reasonHistory");
const reasonInput = document.getElementById("reasonInput");
const distractionCancel = document.getElementById("distractionCancel");
const distractionConfirm = document.getElementById("distractionConfirm");

const DIAL_CENTER = 120;
const DIAL_RADIUS = 96;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const MIN_REASON_LENGTH = 10;

let settings = await loadSettings();
let selectedMinutes = 10;
// The most recently removed block-list entry, so it can be restored in one click.
let lastRemoved = null;

dialProgress.style.strokeDasharray = String(DIAL_CIRCUMFERENCE);

onSettingsChanged((next) => {
  settings = next;
  render();
  if (!blockModal.hidden) {
    renderSettingsModal();
  }
});

focusStartBtn.addEventListener("click", onFocusStart);
distractionOpenBtn.addEventListener("click", () => openDistractionModal());
gearButton.addEventListener("click", () => openBlockModal());

blockForm.addEventListener("submit", onAddHost);
blockListEl.addEventListener("click", onBlockListClick);
blockUndo.addEventListener("click", onUndoRemove);
blockPrimary.addEventListener("click", onBlockPrimary);
blockCancel.addEventListener("click", () => closeModal(blockModal));

clockFormatButtons.forEach((button) => {
  button.addEventListener("click", () => saveSettings({ hour24: button.dataset.hour24 === "true" }));
});

progressButtons.forEach((button) => {
  button.addEventListener("click", () => saveSettings({ showProgressBars: button.dataset.progress === "true" }));
});

shapeButtons.forEach((button) => {
  button.addEventListener("click", () => saveSettings({ shape: button.dataset.shape }));
});

clockColorInput.addEventListener("input", () => saveSettings({ clockColor: clockColorInput.value }));
clockColorReset.addEventListener("click", () => saveSettings({ clockColor: "" }));

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
    openBlockModal();
    return;
  }

  await saveSettings({ focusActive: true, distractionUntil: 0 });
}

// --- Block list editor ---------------------------------------------------

function openBlockModal() {
  lastRemoved = null;
  renderSettingsModal();
  blockModal.hidden = false;

  if (getFocusState(settings) !== "focused") {
    blockInput.focus();
  }
}

function renderSettingsModal() {
  const idle = getFocusState(settings) === "idle";
  blockPrimary.textContent = idle ? "Start focus" : "Done";
  blockPrimary.disabled = idle && settings.blockList.length === 0;
  // When focused/on a break the primary button just closes the panel, so a
  // separate Cancel would be redundant — settings save live either way. Only
  // keep Cancel while idle, where it means "close without starting focus".
  blockCancel.hidden = !idle;

  clockFormatButtons.forEach((button) => {
    const isActive = (button.dataset.hour24 === "true") === settings.hour24;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  progressButtons.forEach((button) => {
    const isActive = (button.dataset.progress === "true") === settings.showProgressBars;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  shapeButtons.forEach((button) => {
    const isActive = button.dataset.shape === settings.shape;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  // Show the picked colour, or the current theme default when none is set.
  clockColorInput.value = settings.clockColor || DEFAULT_CLOCK_COLORS[settings.mode] || DEFAULT_CLOCK_COLORS.dark;
  clockColorReset.hidden = !settings.clockColor;

  // The block list is locked while actively focused, so you can't edit your way
  // out of the sites you committed to. On a break it's editable again.
  const locked = getFocusState(settings) === "focused";
  blockSection.classList.toggle("is-locked", locked);
  blockLock.hidden = !locked;

  // Offer to undo the last removal, unless the list is locked or it's already back.
  const canUndo = !locked && lastRemoved && !settings.blockList.includes(lastRemoved.host);
  blockUndo.hidden = !canUndo;
  if (canUndo) {
    blockUndo.title = `Undo removing ${lastRemoved.host}`;
    blockUndo.setAttribute("aria-label", `Undo removing ${lastRemoved.host}`);
  }
  blockInput.disabled = locked;
  blockForm.querySelector("button[type=submit]").disabled = locked;

  blockListEl.replaceChildren();
  settings.blockList.forEach((host) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "block-host";
    name.textContent = host;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "block-remove";
    remove.dataset.host = host;
    remove.disabled = locked;
    remove.setAttribute("aria-label", `Remove ${host}`);
    remove.textContent = "×";

    li.append(name, remove);
    blockListEl.append(li);
  });

  blockEmpty.hidden = settings.blockList.length > 0;
}

async function onAddHost(event) {
  event.preventDefault();
  const host = normalizeHost(blockInput.value);
  blockInput.value = "";
  blockInput.focus();

  if (!host || settings.blockList.includes(host)) {
    return;
  }

  lastRemoved = null;
  await saveSettings({ blockList: [...settings.blockList, host] });
}

async function onBlockListClick(event) {
  const button = event.target.closest(".block-remove");
  if (!button) {
    return;
  }

  const host = button.dataset.host;
  // Remember what we dropped (and where) so a single undo can put it back.
  lastRemoved = { host, index: settings.blockList.indexOf(host) };
  await saveSettings({ blockList: settings.blockList.filter((item) => item !== host) });
}

async function onUndoRemove() {
  if (!lastRemoved || settings.blockList.includes(lastRemoved.host)) {
    lastRemoved = null;
    renderSettingsModal();
    return;
  }

  const next = [...settings.blockList];
  next.splice(Math.min(lastRemoved.index, next.length), 0, lastRemoved.host);
  lastRemoved = null;
  await saveSettings({ blockList: next });
}

async function onBlockPrimary() {
  if (getFocusState(settings) === "idle") {
    await saveSettings({ focusActive: true, distractionUntil: 0 });
  }
  closeModal(blockModal);
}

// --- Distraction (break) picker -----------------------------------------

function openDistractionModal() {
  setMinutes(selectedMinutes);
  reasonInput.value = "";
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
    breakMove.focus();
  } else if (step === "consume") {
    reasonInput.focus();
  } else if (step === "afk") {
    afkClose.focus();
  }
}

// A break can only start once a reason of at least MIN_REASON_LENGTH is given.
function syncConfirmEnabled() {
  distractionConfirm.disabled = reasonInput.value.trim().length < MIN_REASON_LENGTH;
}

async function onConfirmDistraction() {
  if (distractionConfirm.disabled) {
    return;
  }

  const reason = reasonInput.value.trim();
  // Keep the newest first, drop any duplicate of this reason, and cap the list.
  const recentReasons = [reason, ...settings.recentReasons.filter((item) => item !== reason)]
    .slice(0, MAX_RECENT_REASONS);

  await saveSettings({ distractionUntil: Date.now() + selectedMinutes * 60000, recentReasons });
  closeModal(distractionModal);
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
