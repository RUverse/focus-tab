import { getPomodoroState, loadSettings, onSettingsChanged, pomodoroDuration, saveSettings } from "./shared.js";

const panel = document.getElementById("pomodoro");
const handle = document.getElementById("pomodoroHandle");
const time = document.getElementById("pomodoroTime");
const status = document.getElementById("pomodoroStatus");
const toggle = document.getElementById("pomodoroToggle");
const reset = document.getElementById("pomodoroReset");
const phases = [...panel.querySelectorAll("[data-pomodoro-phase]")];
let settings = await loadSettings();
let ticker = 0;
let dragging = null;
let saving = false;
let error = "";

function render() {
  panel.hidden = !settings.pomodoroEnabled || settings.pomodoroHidden;
  window.clearInterval(ticker);
  if (panel.hidden) return;
  // Keep the timer at 1x, shrinking only to fit very small viewports.
  const scale = Math.min(1, (innerWidth - 32) / 240, (innerHeight - 32) / 246);
  panel.style.setProperty("--pomodoro-scale", Math.max(0.5, scale));
  if (!dragging) position(settings.pomodoroPos);
  tick();
  if (settings.pomodoro.endsAt > Date.now()) ticker = window.setInterval(tick, 250);
}

function tick() {
  const state = getPomodoroState(settings.pomodoro);
  const seconds = Math.ceil(state.remainingMs / 1000);
  time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  toggle.textContent = state.endsAt ? "Pause" : state.remainingMs < pomodoroDuration(state.phase) ? "Resume" : "Start";
  phases.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.pomodoroPhase === state.phase)));
  const completed = settings.pomodoro.endsAt && !state.endsAt;
  const message = error || (completed
    ? state.phase === "break" ? "Focus complete. Ready for a break?" : "Break complete. Ready to focus?"
    : state.endsAt ? state.phase === "focus" ? "Time to focus" : "Take a breather"
    : state.remainingMs < pomodoroDuration(state.phase) ? "Paused" : state.phase === "focus" ? "Ready to focus" : "Ready for a break");
  if (status.textContent !== message) status.textContent = message;
  if (!state.endsAt) window.clearInterval(ticker);
}

async function persist(patch) {
  if (saving) return;
  saving = true;
  error = "";
  try {
    settings = await saveSettings(patch);
  } catch {
    error = "Could not save. Please try again.";
  } finally {
    saving = false;
    render();
  }
}

// Read current storage before an action in case another tab just changed it.
async function changeTimer(action) {
  if (saving) return;
  settings = await loadSettings();
  const now = Date.now();
  const state = getPomodoroState(settings.pomodoro, now);
  await persist({ pomodoro: action(state, now) });
}

toggle.addEventListener("click", () => changeTimer((state, now) => ({
  ...state, endsAt: state.endsAt ? 0 : now + state.remainingMs
})));
reset.addEventListener("click", () => changeTimer((state) => ({
  phase: state.phase, remainingMs: pomodoroDuration(state.phase), endsAt: 0
})));
phases.forEach((button) => button.addEventListener("click", () => changeTimer(() => ({
  phase: button.dataset.pomodoroPhase, remainingMs: pomodoroDuration(button.dataset.pomodoroPhase), endsAt: 0
}))));

function position(point) {
  const rect = panel.getBoundingClientRect();
  const x = Math.min(Math.max(point?.x ?? innerWidth - rect.width - 32, 8), Math.max(8, innerWidth - rect.width - 8));
  const y = Math.min(Math.max(point?.y ?? innerHeight - rect.height - 100, 8), Math.max(8, innerHeight - rect.height - 8));
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  return { x, y };
}

handle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const rect = panel.getBoundingClientRect();
  panel.classList.add("is-dragging");
  dragging = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  handle.setPointerCapture(event.pointerId);
});
handle.addEventListener("pointermove", (event) => {
  if (dragging) position({ x: event.clientX - dragging.x, y: event.clientY - dragging.y });
});
function finishDrag() {
  if (!dragging) return;
  dragging = null;
  panel.classList.remove("is-dragging");
  const { left: x, top: y } = panel.getBoundingClientRect();
  persist({ pomodoroPos: { x, y } });
}
handle.addEventListener("pointerup", finishDrag);
handle.addEventListener("lostpointercapture", finishDrag);
handle.addEventListener("pointercancel", finishDrag);
handle.addEventListener("keydown", (event) => {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const rect = panel.getBoundingClientRect();
  const step = event.shiftKey ? 40 : 10;
  persist({ pomodoroPos: position({ x: rect.left + direction[0] * step, y: rect.top + direction[1] * step }) });
});
onSettingsChanged((next) => { settings = next; render(); });
window.addEventListener("resize", render);
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { window.clearInterval(ticker); return; }
  settings = await loadSettings();
  render();
});
render();
