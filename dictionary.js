import {
  DICTIONARY_LANGUAGES,
  DICTIONARY_MIN_HEIGHT,
  DICTIONARY_MIN_WIDTH,
  addDictionaryEntry,
  dictionaryKey,
  loadSettings,
  normalizeDictionarySize,
  onSettingsChanged,
  removeDictionaryEntry,
  saveSettings
} from "./shared.js";
import { LookupError, lookupTerm } from "./dictionary-lookup.js";

const panel = document.getElementById("dictionary");
const handle = document.getElementById("dictionaryHandle");
const form = document.getElementById("dictionaryForm");
const input = document.getElementById("dictionaryInput");
const languageSelect = document.getElementById("dictionaryLanguage");
const languageBox = document.getElementById("dictionaryLanguageBox");
const languageCode = document.getElementById("dictionaryLanguageCode");
const status = document.getElementById("dictionaryStatus");
const list = document.getElementById("dictionaryHistory");
const resizer = document.getElementById("dictionaryResize");
const EDGE_MARGIN = 8;
const DEFAULT_POS = { x: 46, y: 96 };

let settings = await loadSettings();
let pending = false;
let dragging = null;
let resizing = null;
// tone: "busy" while looking up, "error" for problems, "quiet" for a
// screen-reader-only confirmation of the newest row.
let message = { text: "", tone: "" };

languageSelect.replaceChildren(...DICTIONARY_LANGUAGES.map(({ code, label }) => new Option(label, code)));

function languageLabel(code) {
  return DICTIONARY_LANGUAGES.find((language) => language.code === code)?.label || code;
}

function render() {
  panel.hidden = !settings.dictionaryEnabled || settings.dictionaryHidden;
  if (panel.hidden) return;
  const language = settings.dictionaryLanguage;
  if (document.activeElement !== languageSelect) languageSelect.value = language;
  // The closed picker shows just the code; its list has the full names.
  languageCode.textContent = language.toUpperCase();
  languageBox.title = languageLabel(language);
  input.lang = language;
  renderHistory();
  renderStatus();
  if (!resizing) applySize(settings.dictionarySize);
  if (!dragging) position(settings.dictionaryPos);
}

function renderHistory() {
  const history = settings.dictionaryHistory;
  const focusedKey = list.contains(document.activeElement)
    ? document.activeElement.closest(".dictionary-entry")?.dataset.key
    : "";
  if (history.length) {
    list.replaceChildren(...history.map(renderEntry));
  } else {
    const empty = document.createElement("li");
    empty.className = "dictionary-empty";
    empty.textContent = "Your lookups will appear here.";
    list.replaceChildren(empty);
  }
  if (focusedKey) focusEntry(focusedKey);
}

function renderEntry(entry) {
  const item = document.createElement("li");
  item.className = "dictionary-entry";
  item.dataset.key = dictionaryKey(entry.lang, entry.term);
  item.dataset.lang = entry.lang;
  item.dataset.term = entry.term;

  const head = document.createElement("div");
  head.className = "dictionary-entry-head";

  const term = document.createElement("span");
  term.className = "dictionary-term";
  term.lang = entry.lang;
  term.textContent = entry.term;
  // Rows from another language than the selected one say which it is.
  if (entry.lang !== settings.dictionaryLanguage) {
    const tag = document.createElement("abbr");
    tag.className = "dictionary-entry-lang";
    tag.title = languageLabel(entry.lang);
    tag.textContent = entry.lang.toUpperCase();
    term.prepend(tag, " ");
  }

  const translation = document.createElement("span");
  translation.className = "dictionary-translation";
  translation.lang = "en";
  translation.textContent = entry.translation;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dictionary-remove";
  remove.setAttribute("aria-label", `Remove “${entry.term}” from history`);
  remove.title = "Remove from history";
  remove.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  head.append(term, translation, remove);
  item.append(head);

  if (entry.definitions.length) {
    const definition = document.createElement("p");
    definition.className = "dictionary-definition";
    definition.lang = entry.lang;
    definition.textContent = entry.definitions.length === 1
      ? entry.definitions[0]
      : entry.definitions.map((text, index) => `${index + 1}. ${text}`).join(" ");
    definition.title = definition.textContent;
    item.append(definition);
  }

  if (entry.source !== "wiktionary") {
    const note = document.createElement("p");
    note.className = "dictionary-note";
    note.textContent = entry.source === "on-device" ? "Machine translation · on-device" : "Machine translation · MyMemory";
    item.append(note);
  }

  return item;
}

function focusEntry(key) {
  const item = [...list.querySelectorAll(".dictionary-entry")].find((entry) => entry.dataset.key === key);
  (item?.querySelector(".dictionary-remove") || input).focus();
}

function setMessage(text, tone = "") {
  message = { text, tone };
  renderStatus();
}

// Rewriting identical text would make screen readers announce it again.
function renderStatus() {
  if (status.textContent !== message.text) status.textContent = message.text;
  status.dataset.tone = message.tone;
}

async function persist(patch) {
  try {
    settings = await saveSettings(patch);
    return true;
  } catch {
    setMessage("Could not save. Please try again.", "error");
    return false;
  } finally {
    render();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) return;
  const text = input.value.replace(/\s+/g, " ").trim();
  if (!text) {
    setMessage("Type a word or phrase first.", "error");
    return;
  }

  const lang = settings.dictionaryLanguage;
  pending = true;
  panel.setAttribute("aria-busy", "true");
  setMessage("Looking up…", "busy");
  let entry = null;
  try {
    // Looking up a word again moves the saved row to the top without a request.
    const current = await loadSettings();
    const key = dictionaryKey(lang, text);
    const saved = current.dictionaryHistory.find((item) => dictionaryKey(item.lang, item.term) === key);
    entry = saved ? { ...saved, at: Date.now() } : await lookupTerm(text, lang);
  } catch (error) {
    setMessage(error instanceof LookupError ? error.message : "Something went wrong. Please try again.", "error");
  }

  if (entry) {
    // Re-read storage in case another tab changed the history meanwhile.
    const latest = await loadSettings();
    if (await persist({ dictionaryHistory: addDictionaryEntry(latest.dictionaryHistory, entry) })) {
      input.value = "";
      list.scrollTop = 0;
      setMessage(`${entry.term}: ${entry.translation}`, "quiet");
    }
  }
  pending = false;
  panel.removeAttribute("aria-busy");
  render();
});

input.addEventListener("input", () => {
  if (message.tone === "error" || message.tone === "quiet") setMessage("");
});

languageSelect.addEventListener("change", () => {
  setMessage("");
  persist({ dictionaryLanguage: languageSelect.value });
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest(".dictionary-remove");
  if (!button) return;
  const item = button.closest(".dictionary-entry");
  const neighbor = item.nextElementSibling || item.previousElementSibling;
  const current = await loadSettings();
  if (await persist({ dictionaryHistory: removeDictionaryEntry(current.dictionaryHistory, item.dataset.lang, item.dataset.term) })) {
    setMessage(`Removed “${item.dataset.term}”.`, "quiet");
    if (neighbor?.dataset.key) focusEntry(neighbor.dataset.key);
    else input.focus();
  }
});

function position(point) {
  const rect = panel.getBoundingClientRect();
  const target = point || DEFAULT_POS;
  const x = Math.min(Math.max(target.x, EDGE_MARGIN), Math.max(EDGE_MARGIN, innerWidth - rect.width - EDGE_MARGIN));
  const y = Math.min(Math.max(target.y, EDGE_MARGIN), Math.max(EDGE_MARGIN, innerHeight - rect.height - EDGE_MARGIN));
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
  persist({ dictionaryPos: { x, y } });
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
  persist({ dictionaryPos: position({ x: rect.left + direction[0] * step, y: rect.top + direction[1] * step }) });
});

// A resized box keeps its size, shrunk to fit smaller windows; otherwise the
// stylesheet's default width and three-row history height apply.
function applySize(size) {
  panel.classList.toggle("is-sized", Boolean(size));
  panel.style.width = size ? `${Math.min(size.width, innerWidth - EDGE_MARGIN * 2)}px` : "";
  panel.style.height = size ? `${Math.min(size.height, innerHeight - EDGE_MARGIN * 2)}px` : "";
}

function resizeTo(width, height) {
  const rect = panel.getBoundingClientRect();
  const size = normalizeDictionarySize({
    width: Math.min(width, innerWidth - rect.left - EDGE_MARGIN),
    height: Math.min(height, innerHeight - rect.top - EDGE_MARGIN)
  });
  applySize(size);
  return size;
}

resizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const rect = panel.getBoundingClientRect();
  panel.classList.add("is-resizing");
  resizing = { x: event.clientX - rect.width, y: event.clientY - rect.height, size: null };
  resizer.setPointerCapture(event.pointerId);
  event.preventDefault();
});
resizer.addEventListener("pointermove", (event) => {
  if (resizing) resizing.size = resizeTo(event.clientX - resizing.x, event.clientY - resizing.y);
});
function finishResize() {
  if (!resizing) return;
  const { size } = resizing;
  resizing = null;
  panel.classList.remove("is-resizing");
  if (size) persist({ dictionarySize: size });
}
resizer.addEventListener("pointerup", finishResize);
resizer.addEventListener("lostpointercapture", finishResize);
resizer.addEventListener("pointercancel", finishResize);
resizer.addEventListener("dblclick", () => persist({ dictionarySize: null }));
resizer.addEventListener("keydown", (event) => {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const rect = panel.getBoundingClientRect();
  const step = event.shiftKey ? 40 : 10;
  persist({ dictionarySize: resizeTo(rect.width + direction[0] * step, rect.height + direction[1] * step) });
});

onSettingsChanged((next) => { settings = next; render(); });
window.addEventListener("resize", render);
render();
