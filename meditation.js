// Meditation is local to this page and never changes focus or blocking state.
export function createMeditation(onClose) {
  const modal = document.getElementById("meditationModal");
  const setup = document.getElementById("meditationSetup");
  const session = document.getElementById("meditationSession");
  const particles = document.getElementById("meditationParticles");
  const instruction = document.getElementById("meditationInstruction");
  const remaining = document.getElementById("meditationRemaining");
  const start = document.getElementById("meditationStart");
  const back = document.getElementById("meditationBack");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = null;
  let startedAt = 0;
  let duration = 0;

  for (let i = 0; i < 72; i += 1) {
    const particle = document.createElement("span");
    const angle = i * Math.PI * 2 / 72;
    const radius = 43 + Math.sin(i * 2.4) * 3;
    particle.style.left = `${50 + Math.cos(angle) * radius}%`;
    particle.style.top = `${50 + Math.sin(angle) * radius}%`;
    particle.style.opacity = String(0.45 + (i % 5) * 0.13);
    particles.append(particle);
  }

  function stop() {
    window.cancelAnimationFrame(frame);
    frame = null;
  }

  function reset() {
    stop();
    setup.hidden = false;
    session.hidden = true;
    start.hidden = false;
    back.textContent = "Back";
    instruction.textContent = "";
  }

  function update() {
    // Wall time keeps the countdown and breathing phase aligned after tab sleep.
    const elapsed = Math.max(0, Date.now() - startedAt);
    const seconds = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    remaining.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (elapsed >= duration) {
      stop();
      instruction.textContent = "Session complete";
      remaining.textContent = "Take a moment. Return when you're ready.";
      particles.style.transform = "scale(0.65)";
      back.textContent = "Done";
      return;
    }

    const cycleMs = 12000; // Six seconds inward, then six seconds outward.
    const phase = elapsed % cycleMs / cycleMs;
    const cue = phase < 0.5 ? "Breathe in" : "Breathe out";
    if (instruction.textContent !== cue) instruction.textContent = cue;
    const scale = reducedMotion.matches ? 0.8 : 0.65 + 0.35 * (1 + Math.cos(phase * Math.PI * 2)) / 2;
    particles.style.transform = `scale(${scale})`;
    frame = window.requestAnimationFrame(update);
  }

  start.addEventListener("click", () => {
    const minutes = Number(modal.querySelector("input:checked").value);
    duration = ([2, 5, 10].includes(minutes) ? minutes : 2) * 60000;
    startedAt = Date.now();
    setup.hidden = true;
    session.hidden = false;
    start.hidden = true;
    back.focus();
    update();
  });
  back.addEventListener("click", () => {
    if (!session.hidden && back.textContent !== "Done") {
      reset();
      start.focus();
    } else {
      modal.close();
    }
  });
  modal.addEventListener("close", () => {
    reset();
    onClose();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...modal.querySelectorAll("input:checked, button")]
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", () => {
    if (modal.open && !session.hidden && back.textContent !== "Done") update();
  });

  return {
    open() {
      reset();
      modal.showModal();
      modal.querySelector("input:checked").focus();
    }
  };
}
