import { loadSettings, onSettingsChanged, saveSettings } from "./shared.js";

const fidgetEl = document.getElementById("fidget");
const spinnerRotor = document.getElementById("fidgetSpinnerRotor");
const clickyCount = document.getElementById("fidgetClickyCount");

// Pointer travel below this is a click (spin/press); beyond it, a move.
const DRAG_THRESHOLD = 6;
// Keep at least this much of a gap to the viewport edges when dragging/clamping.
const EDGE_MARGIN = 8;
// Spinner friction: velocity halves roughly every 1.2 s, so a flick winds down
// over a few seconds instead of stopping dead or spinning forever.
const SPIN_DECAY = 0.55;
const SPIN_MIN_VELOCITY = 12;
// Spin only responds to taps on the hub, like a real spinner's center cap;
// the arms are for watching, the rest of the body for dragging. Hub geometry
// in SVG user units, scaled to on-screen pixels at hit-test time.
const SPINNER_VIEWBOX = 72;
const SPINNER_HUB_RADIUS = 7.5;
const HUB_HIT_SLACK = 6;
// Pressing the rotor is a finger on a real spinner: it brakes far harder than
// free spin, so a quick tap sheds roughly half the speed and holding on stops
// it within about half a second.
const BRAKE_DECAY = 6;
// Cap fling speed at ten revolutions per second.
const SPIN_MAX_VELOCITY = 3600;
// Fling velocity is averaged over this trailing window of drag samples, so the
// throw matches how fast the hand was moving at release, not the whole drag.
const FLING_WINDOW_MS = 120;

let settings = await loadSettings();
let dragging = false;

// Spinner physics (degrees / degrees-per-second). Session-only, like the count.
let spinAngle = 0;
let spinVelocity = 0;
let spinFrame = 0;
let spinLastTick = 0;
// True while a finger rests on the rotor (heavy friction in the tick loop).
let braking = false;

let clicks = 0;

render();

onSettingsChanged((next) => {
  settings = next;
  render();
});

// Re-clamp a stored position that no longer fits after the window shrinks.
window.addEventListener("resize", applyPosition);

fidgetEl.addEventListener("pointerdown", onPointerDown);

function render() {
  fidgetEl.dataset.type = settings.fidget;
  fidgetEl.hidden = settings.fidget === "off";

  if (settings.fidget !== "spinner") {
    stopSpinner();
  }

  // While a drag is in flight the pointer owns the position; storage catches up
  // on release.
  if (!dragging) {
    applyPosition();
  }
}

function applyPosition() {
  if (fidgetEl.hidden) {
    return;
  }

  if (!settings.fidgetPos) {
    // Default bottom-left spot comes from the stylesheet.
    fidgetEl.style.left = "";
    fidgetEl.style.top = "";
    return;
  }

  setPosition(settings.fidgetPos.x, settings.fidgetPos.y);
}

function setPosition(x, y) {
  const clamped = clampToViewport(x, y);
  fidgetEl.style.left = `${clamped.x}px`;
  fidgetEl.style.top = `${clamped.y}px`;
  return clamped;
}

function clampToViewport(x, y) {
  const rect = fidgetEl.getBoundingClientRect();
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN);

  return {
    x: Math.min(Math.max(x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(y, EDGE_MARGIN), maxY)
  };
}

function onPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();

  const rect = fidgetEl.getBoundingClientRect();

  // The spinner splits into zones: the hub is the handle (tap to kick, drag to
  // move the widget); everything around it belongs to the rotor (drag to
  // scrub, press to brake). Other toys treat the whole body as the handle.
  if (settings.fidget === "spinner" && !isOnHub(event.clientX - rect.left, event.clientY - rect.top, rect)) {
    beginRotorGesture(event, rect);
    return;
  }

  beginMoveGesture(event, rect);
}

function isOnHub(x, y, rect) {
  const distance = Math.hypot(x - rect.width / 2, y - rect.height / 2);
  return distance <= (SPINNER_HUB_RADIUS / SPINNER_VIEWBOX) * rect.width + HUB_HIT_SLACK;
}

// A small press is a fidget interaction, a longer drag picks the toy up and
// moves it.
function beginMoveGesture(event, rect) {
  const startX = event.clientX;
  const startY = event.clientY;
  const offsetX = startX - rect.left;
  const offsetY = startY - rect.top;

  fidgetEl.classList.add("is-pressed");

  const move = (moveEvent) => {
    if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD) {
      return;
    }

    dragging = true;
    fidgetEl.classList.add("is-dragging");
    fidgetEl.classList.remove("is-pressed");
    setPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
  };

  const up = async (upEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    fidgetEl.classList.remove("is-pressed");

    if (!dragging) {
      interact();
      return;
    }

    dragging = false;
    fidgetEl.classList.remove("is-dragging");
    const dropped = setPosition(upEvent.clientX - offsetX, upEvent.clientY - offsetY);
    settings = await saveSettings({ fidgetPos: { x: Math.round(dropped.x), y: Math.round(dropped.y) } });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

function interact() {
  if (settings.fidget === "spinner") {
    // Hub tap: a kick on top of whatever spin is left.
    spinVelocity += 900 + Math.random() * 720;
    startSpinner();
  } else if (settings.fidget === "clicky") {
    clicks += 1;
    clickyCount.textContent = String(clicks);
  }
  // "breathe" is deliberately passive — it only wants your attention.
}

// Rotor gestures on the spinner's arms: press = brake (a tap sheds speed, a
// hold stops it dead), drag = scrub the rotor by hand and let go to fling it.
function beginRotorGesture(event, rect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startX = event.clientX;
  const startY = event.clientY;
  const baseAngle = spinAngle;

  let scrubbing = false;
  let lastPointerAngle = pointerAngle(event, centerX, centerY);
  let travel = 0; // cumulative signed degrees dragged around the centre
  let samples = [{ time: performance.now(), travel: 0 }];

  braking = true;
  startSpinner();

  const move = (moveEvent) => {
    if (!scrubbing && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD) {
      return;
    }

    if (!scrubbing) {
      scrubbing = true;
      braking = false;
      // The hand owns the rotor now; physics resumes on release.
      stopSpinner();
      fidgetEl.classList.add("is-scrubbing");
    }

    const angle = pointerAngle(moveEvent, centerX, centerY);
    travel += angleDelta(angle, lastPointerAngle);
    lastPointerAngle = angle;

    const now = performance.now();
    samples.push({ time: now, travel });
    samples = samples.filter((sample) => now - sample.time <= FLING_WINDOW_MS);

    spinAngle = (baseAngle + travel) % 360;
    spinnerRotor.setAttribute("transform", `rotate(${spinAngle} 36 36)`);
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    braking = false;

    // A plain press already braked in the tick loop; nothing more to do.
    if (!scrubbing) {
      return;
    }

    fidgetEl.classList.remove("is-scrubbing");

    // Fling with the average angular speed over the trailing sample window.
    // A hand that came to rest before letting go releases a still rotor.
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (performance.now() - last.time > FLING_WINDOW_MS) {
      return;
    }

    const seconds = (last.time - first.time) / 1000;
    if (seconds > 0) {
      const velocity = (last.travel - first.travel) / seconds;
      spinVelocity = Math.max(-SPIN_MAX_VELOCITY, Math.min(SPIN_MAX_VELOCITY, velocity));
      startSpinner();
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

// Pointer bearing around the widget centre: 0° at 12 o'clock, clockwise.
function pointerAngle(event, centerX, centerY) {
  return (Math.atan2(event.clientX - centerX, -(event.clientY - centerY)) * 180) / Math.PI;
}

// Shortest signed way from b to a, so crossing 12 o'clock doesn't jump ±360.
function angleDelta(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function startSpinner() {
  if (spinFrame) {
    return;
  }

  spinLastTick = performance.now();
  spinFrame = requestAnimationFrame(spinTick);
}

function spinTick(now) {
  // Cap dt so a backgrounded tab doesn't teleport the rotor on return.
  const dt = Math.min((now - spinLastTick) / 1000, 0.05);
  spinLastTick = now;

  spinAngle = (spinAngle + spinVelocity * dt) % 360;
  spinVelocity *= Math.exp(-(braking ? BRAKE_DECAY : SPIN_DECAY) * dt);
  spinnerRotor.setAttribute("transform", `rotate(${spinAngle} 36 36)`);

  if (Math.abs(spinVelocity) < SPIN_MIN_VELOCITY) {
    spinVelocity = 0;
    spinFrame = 0;
    return;
  }

  spinFrame = requestAnimationFrame(spinTick);
}

function stopSpinner() {
  if (spinFrame) {
    cancelAnimationFrame(spinFrame);
    spinFrame = 0;
  }
  spinVelocity = 0;
}
