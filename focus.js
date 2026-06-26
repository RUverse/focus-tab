import {
  loadSettings,
  onSettingsChanged,
  saveSettings,
  normalizeHost,
  getFocusState,
  DISTRACTION_MIN_MINUTES,
  DISTRACTION_MAX_MINUTES,
  DEFAULT_CLOCK_COLORS
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
const clockFormatButtons = Array.from(document.querySelectorAll("[data-hour24]"));
const progressButtons = Array.from(document.querySelectorAll("[data-progress]"));
const clockColorInput = document.getElementById("clockColorInput");
const clockColorReset = document.getElementById("clockColorReset");

const distractionModal = document.getElementById("distractionModal");
const dial = document.getElementById("dial");
const dialProgress = document.getElementById("dialProgress");
const dialHandle = document.getElementById("dialHandle");
const dialReadout = document.getElementById("dialReadout");
const reasonInput = document.getElementById("reasonInput");
const distractionCancel = document.getElementById("distractionCancel");
const distractionConfirm = document.getElementById("distractionConfirm");

const DIAL_CENTER = 120;
const DIAL_RADIUS = 96;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const MIN_REASON_LENGTH = 10;

let settings = await loadSettings();
let selectedMinutes = 10;

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
blockPrimary.addEventListener("click", onBlockPrimary);
blockCancel.addEventListener("click", () => closeModal(blockModal));

clockFormatButtons.forEach((button) => {
  button.addEventListener("click", () => saveSettings({ hour24: button.dataset.hour24 === "true" }));
});

progressButtons.forEach((button) => {
  button.addEventListener("click", () => saveSettings({ showProgressBars: button.dataset.progress === "true" }));
});

clockColorInput.addEventListener("input", () => saveSettings({ clockColor: clockColorInput.value }));
clockColorReset.addEventListener("click", () => saveSettings({ clockColor: "" }));

distractionCancel.addEventListener("click", () => closeModal(distractionModal));
distractionConfirm.addEventListener("click", onConfirmDistraction);
reasonInput.addEventListener("input", syncConfirmEnabled);
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

  // Show the picked colour, or the current theme default when none is set.
  clockColorInput.value = settings.clockColor || DEFAULT_CLOCK_COLORS[settings.mode] || DEFAULT_CLOCK_COLORS.dark;
  clockColorReset.hidden = !settings.clockColor;

  // The block list is locked while actively focused, so you can't edit your way
  // out of the sites you committed to. On a break it's editable again.
  const locked = getFocusState(settings) === "focused";
  blockSection.classList.toggle("is-locked", locked);
  blockLock.hidden = !locked;
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

  await saveSettings({ blockList: [...settings.blockList, host] });
}

async function onBlockListClick(event) {
  const button = event.target.closest(".block-remove");
  if (!button) {
    return;
  }

  const host = button.dataset.host;
  await saveSettings({ blockList: settings.blockList.filter((item) => item !== host) });
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
  distractionModal.hidden = false;
  reasonInput.focus();
}

// A break can only start once a reason of at least MIN_REASON_LENGTH is given.
function syncConfirmEnabled() {
  distractionConfirm.disabled = reasonInput.value.trim().length < MIN_REASON_LENGTH;
}

async function onConfirmDistraction() {
  if (distractionConfirm.disabled) {
    return;
  }

  await saveSettings({ distractionUntil: Date.now() + selectedMinutes * 60000 });
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
