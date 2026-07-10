import { STICKY_NOTE_MAX_CHARS, applyGadgetScaleStyles, loadSettings, onSettingsChanged, saveSettings } from "./shared.js";

const root = document.getElementById("newtab");
const noteEl = document.getElementById("stickyNoteList");
const handleEl = document.getElementById("stickyNoteHandle");
const contentEl = document.getElementById("stickyNoteContent");
const SAVE_DELAY_MS = 250;
const EDGE_MARGIN = 8;

let settings = await loadSettings();
let saveTimer = 0;
let dragging = false;

render();

onSettingsChanged((next) => {
  settings = next;
  render();
});

contentEl.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNote, SAVE_DELAY_MS);
});

contentEl.addEventListener("blur", saveNote);
handleEl.addEventListener("pointerdown", onHandlePointerDown);
window.addEventListener("resize", onViewportResize);

function render() {
  applyGadgetScaleStyles(root, settings.gadgetScale);
  noteEl.hidden = !settings.stickyNoteListEnabled;

  if (document.activeElement !== contentEl) {
    contentEl.textContent = settings.stickyNoteListText;
  }

  if (!dragging) {
    applyPosition();
  }
}

function onViewportResize() {
  applyGadgetScaleStyles(root, settings.gadgetScale);
  applyPosition();
}

async function saveNote() {
  window.clearTimeout(saveTimer);

  const text = contentEl.textContent.replace(/\r\n?/g, "\n").slice(0, STICKY_NOTE_MAX_CHARS);
  if (text === settings.stickyNoteListText) {
    return;
  }

  if (text !== contentEl.textContent) {
    contentEl.textContent = text;
  }

  settings = await saveSettings({ stickyNoteListText: text });
}

function applyPosition() {
  if (noteEl.hidden) {
    return;
  }

  if (!settings.stickyNoteListPos) {
    noteEl.style.left = "";
    noteEl.style.top = "";
    noteEl.style.bottom = "";
    return;
  }

  setPosition(settings.stickyNoteListPos.x, settings.stickyNoteListPos.y);
}

function setPosition(x, y) {
  const clamped = clampToViewport(x, y);
  noteEl.style.left = `${clamped.x}px`;
  noteEl.style.top = `${clamped.y}px`;
  noteEl.style.bottom = "auto";
  return clamped;
}

function clampToViewport(x, y) {
  const rect = noteEl.getBoundingClientRect();
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN);

  return {
    x: Math.min(Math.max(x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(y, EDGE_MARGIN), maxY)
  };
}

function onHandlePointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();

  const rect = noteEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  dragging = true;
  noteEl.classList.add("is-dragging");
  setPosition(event.clientX - offsetX, event.clientY - offsetY);

  const move = (moveEvent) => {
    setPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
  };

  const up = async (upEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    dragging = false;
    noteEl.classList.remove("is-dragging");

    const dropped = setPosition(upEvent.clientX - offsetX, upEvent.clientY - offsetY);
    settings = await saveSettings({ stickyNoteListPos: { x: Math.round(dropped.x), y: Math.round(dropped.y) } });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
