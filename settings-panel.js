import {
  DEFAULT_CLOCK_COLORS,
  GADGET_SCALE_MAX,
  GADGET_SCALE_MIN,
  GADGET_SCALE_STEP,
  WAVE_BACKGROUNDS,
  getFocusState,
  normalizeHost,
  saveSettings
} from "./shared.js";

export function createSettingsPanel(root, options = {}) {
  let settings = options.getSettings();
  let activeTab = options.initialTab || "general";
  let lastRemoved = null;
  let lockedRemoveHost = "";
  let nameSaveTimer = 0;

  root.innerHTML = `
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button type="button" class="settings-tab" data-settings-tab="general" role="tab">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>General</span>
      </button>
      <button type="button" class="settings-tab" data-settings-tab="block" role="tab">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M7 17 17 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>Block list</span>
      </button>
      <button type="button" class="settings-tab" data-settings-tab="gadgets" role="tab">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="6.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="16.8" cy="15" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="7.2" cy="15" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
        </svg>
        <span>Gadgets</span>
      </button>
    </div>

    <section class="settings-section settings-pane" data-settings-panel="general" role="tabpanel">
      <div class="setting-row">
        <span class="setting-label">Name</span>
        <input class="setting-input" data-name-input type="text" maxlength="28" autocomplete="off" spellcheck="false" aria-label="Name">
      </div>

      <div class="setting-row">
        <span class="setting-label">Theme</span>
        <div class="segmented" role="group" aria-label="Theme">
          <button type="button" class="seg-button" data-mode="dark">Dark</button>
          <button type="button" class="seg-button" data-mode="light">Light</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Progress bars</span>
        <div class="segmented" role="group" aria-label="Progress bars">
          <button type="button" class="seg-button" data-progress="false">Off</button>
          <button type="button" class="seg-button" data-progress="true">On</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Clock format</span>
        <div class="segmented" role="group" aria-label="Clock format">
          <button type="button" class="seg-button" data-hour24="false">12h</button>
          <button type="button" class="seg-button" data-hour24="true">24h</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Show seconds</span>
        <div class="segmented" role="group" aria-label="Show seconds">
          <button type="button" class="seg-button" data-seconds="false">Off</button>
          <button type="button" class="seg-button" data-seconds="true">On</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Shapes</span>
        <div class="segmented" role="group" aria-label="Shapes">
          <button type="button" class="seg-button" data-shape="boxy">Boxy</button>
          <button type="button" class="seg-button" data-shape="round">Round</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Accent color</span>
        <div class="color-control">
          <button type="button" class="link-button" data-clock-color-reset hidden>Reset</button>
          <input type="color" class="color-input" data-clock-color-input aria-label="Accent color">
        </div>
      </div>

      <div class="setting-row">
        <label class="setting-label" for="waveBackgroundSelect">Background waves</label>
        <select class="setting-input" id="waveBackgroundSelect" data-wave-background>
          <option value="off">Off</option>
          <option value="random">Random</option>
          <option value="quiet-current">Quiet Current</option>
          <option value="soft-arc">Soft Arc</option>
          <option value="diagonal-drift">Diagonal Drift</option>
          <option value="signal-bloom">Signal Bloom</option>
        </select>
      </div>
    </section>

    <section class="settings-section settings-pane" data-settings-panel="block" role="tabpanel">
      <div class="settings-heading-row">
        <button type="button" class="undo-button" data-block-undo hidden aria-label="Undo remove" title="Undo remove">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 7H15a4.5 4.5 0 0 1 0 9H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11.5 4 8 7l3.5 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Undo</span>
        </button>
      </div>
      <p class="modal-sub">Sites you add here can't be opened while you're focused.</p>

      <div class="setting-row">
        <span class="setting-label">Break delay</span>
        <div class="segmented" role="group" aria-label="Break delay">
          <button type="button" class="seg-button" data-break-delay="false">Off</button>
          <button type="button" class="seg-button" data-break-delay="true">On</button>
        </div>
      </div>

      <form class="block-add" data-block-form>
        <input data-block-input type="text" placeholder="x.com" autocomplete="off" spellcheck="false" aria-label="Website to block">
        <button type="submit">Add</button>
      </form>

      <ul class="block-list" data-block-list aria-label="Blocked sites"></ul>
      <p class="block-empty" data-block-empty>No sites yet. Add one above to get started.</p>
    </section>

    <section class="settings-section settings-pane" data-settings-panel="gadgets" role="tabpanel">
      <div class="setting-row">
        <span class="setting-label">Motivational quote</span>
        <div class="segmented" role="group" aria-label="Motivational quote">
          <button type="button" class="seg-button" data-motivational-quote="false">Off</button>
          <button type="button" class="seg-button" data-motivational-quote="true">On</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Fidget</span>
        <div class="segmented" role="group" aria-label="Fidget">
          <button type="button" class="seg-button" data-fidget="off">Off</button>
          <button type="button" class="seg-button" data-fidget="spinner">Spinner</button>
          <button type="button" class="seg-button" data-fidget="clicky">Clicky</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Sticky note list</span>
        <div class="segmented" role="group" aria-label="Sticky note list">
          <button type="button" class="seg-button" data-sticky-note-list="false">Off</button>
          <button type="button" class="seg-button" data-sticky-note-list="true">On</button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">Gadget scale</span>
        <div class="range-control">
          <input class="range-input" data-gadget-scale type="range" min="${GADGET_SCALE_MIN}" max="${GADGET_SCALE_MAX}" step="${GADGET_SCALE_STEP}" aria-label="Gadget scale">
          <output class="range-value" data-gadget-scale-output>1x</output>
        </div>
      </div>
    </section>
  `;

  const tabButtons = Array.from(root.querySelectorAll("[data-settings-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-settings-panel]"));
  const nameInput = root.querySelector("[data-name-input]");
  const clockColorInput = root.querySelector("[data-clock-color-input]");
  const clockColorReset = root.querySelector("[data-clock-color-reset]");
  const blockForm = root.querySelector("[data-block-form]");
  const blockInput = root.querySelector("[data-block-input]");
  const blockList = root.querySelector("[data-block-list]");
  const blockEmpty = root.querySelector("[data-block-empty]");
  const blockUndo = root.querySelector("[data-block-undo]");
  const gadgetScaleInput = root.querySelector("[data-gadget-scale]");
  const gadgetScaleOutput = root.querySelector("[data-gadget-scale-output]");
  const waveBackgroundSelect = root.querySelector("[data-wave-background]");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.settingsTab;
      render();
      focusCurrentTab();
    });
  });

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ mode: button.dataset.mode }));
  });

  root.querySelectorAll("[data-progress]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ showProgressBars: button.dataset.progress === "true" }));
  });

  root.querySelectorAll("[data-hour24]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ hour24: button.dataset.hour24 === "true" }));
  });

  root.querySelectorAll("[data-seconds]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ showSeconds: button.dataset.seconds === "true" }));
  });

  root.querySelectorAll("[data-shape]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ shape: button.dataset.shape }));
  });

  waveBackgroundSelect.addEventListener("change", () => {
    const value = WAVE_BACKGROUNDS.includes(waveBackgroundSelect.value)
      ? waveBackgroundSelect.value
      : "quiet-current";
    patchSettings({ waveBackground: value });
  });

  root.querySelectorAll("[data-fidget]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ fidget: button.dataset.fidget }));
  });

  root.querySelectorAll("[data-sticky-note-list]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ stickyNoteListEnabled: button.dataset.stickyNoteList === "true" }));
  });

  root.querySelectorAll("[data-motivational-quote]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ motivationalQuoteEnabled: button.dataset.motivationalQuote === "true" }));
  });

  gadgetScaleInput.addEventListener("input", () => {
    patchSettings({ gadgetScale: Number(gadgetScaleInput.value) });
  });

  root.querySelectorAll("[data-break-delay]").forEach((button) => {
    button.addEventListener("click", () => patchSettings({ contentBreakDelayEnabled: button.dataset.breakDelay === "true" }));
  });

  nameInput.addEventListener("input", () => {
    window.clearTimeout(nameSaveTimer);
    const value = nameInput.value;
    nameSaveTimer = window.setTimeout(() => patchSettings({ name: value }), 180);
  });
  nameInput.addEventListener("change", () => patchSettings({ name: nameInput.value }));
  nameInput.addEventListener("blur", () => patchSettings({ name: nameInput.value }));

  clockColorInput.addEventListener("input", saveClockColor);
  clockColorInput.addEventListener("change", saveClockColor);
  clockColorReset.addEventListener("click", () => patchSettings({ clockColor: "" }));

  blockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const host = normalizeHost(blockInput.value);
    blockInput.value = "";
    blockInput.focus();

    if (!host || settings.blockList.includes(host)) {
      return;
    }

    lastRemoved = null;
    lockedRemoveHost = "";
    await patchSettings({ blockList: [...settings.blockList, host] });
  });

  blockList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-block-remove]");
    if (!button) {
      return;
    }

    const host = button.dataset.host;
    if (getLocked()) {
      lockedRemoveHost = host;
      renderBlockList();
      return;
    }

    lockedRemoveHost = "";
    lastRemoved = { host, index: settings.blockList.indexOf(host) };
    await patchSettings({ blockList: settings.blockList.filter((item) => item !== host) });
  });

  blockUndo.addEventListener("click", async () => {
    if (!lastRemoved || settings.blockList.includes(lastRemoved.host)) {
      return;
    }

    const next = [...settings.blockList];
    lockedRemoveHost = "";
    next.splice(Math.max(0, lastRemoved.index), 0, lastRemoved.host);
    await patchSettings({ blockList: next });
  });

  function render(nextSettings = settings) {
    settings = nextSettings;

    renderTabs();
    setActive("[data-mode]", (button) => button.dataset.mode === settings.mode);
    setActive("[data-progress]", (button) => (button.dataset.progress === "true") === settings.showProgressBars);
    setActive("[data-hour24]", (button) => (button.dataset.hour24 === "true") === settings.hour24);
    setActive("[data-seconds]", (button) => (button.dataset.seconds === "true") === settings.showSeconds);
    setActive("[data-shape]", (button) => button.dataset.shape === settings.shape);
    setActive("[data-fidget]", (button) => button.dataset.fidget === settings.fidget);
    setActive("[data-sticky-note-list]", (button) => (button.dataset.stickyNoteList === "true") === settings.stickyNoteListEnabled);
    setActive("[data-motivational-quote]", (button) => (button.dataset.motivationalQuote === "true") === settings.motivationalQuoteEnabled);
    setActive("[data-break-delay]", (button) => (button.dataset.breakDelay === "true") === settings.contentBreakDelayEnabled);

    if (document.activeElement !== nameInput) {
      nameInput.value = settings.name;
    }

    clockColorInput.value = settings.clockColor || DEFAULT_CLOCK_COLORS[settings.mode] || DEFAULT_CLOCK_COLORS.dark;
    clockColorReset.hidden = !settings.clockColor;
    gadgetScaleInput.value = String(settings.gadgetScale);
    gadgetScaleInput.setAttribute("aria-valuetext", formatScale(settings.gadgetScale));
    gadgetScaleOutput.value = formatScale(settings.gadgetScale);
    waveBackgroundSelect.value = WAVE_BACKGROUNDS.includes(settings.waveBackground)
      ? settings.waveBackground
      : "quiet-current";
    renderBlockList();
  }

  function renderTabs() {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.settingsTab === activeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== activeTab;
    });
  }

  function renderBlockList() {
    const locked = getLocked();
    if (!locked || !settings.blockList.includes(lockedRemoveHost)) {
      lockedRemoveHost = "";
    }

    const canUndo = lastRemoved && !settings.blockList.includes(lastRemoved.host);
    blockUndo.hidden = !canUndo;
    if (canUndo) {
      blockUndo.title = `Undo removing ${lastRemoved.host}`;
      blockUndo.setAttribute("aria-label", `Undo removing ${lastRemoved.host}`);
    }

    blockList.replaceChildren();
    settings.blockList.forEach((host, index) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "block-host";
      name.textContent = host;

      const actions = document.createElement("span");
      actions.className = "block-actions";

      const lock = document.createElement("span");
      lock.className = "settings-lock block-lock-inline";
      lock.id = `block-lock-${index}`;
      lock.setAttribute("role", "status");
      lock.textContent = "Locked while focused";
      lock.hidden = lockedRemoveHost !== host;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "block-remove";
      remove.dataset.blockRemove = "";
      remove.dataset.host = host;
      remove.setAttribute("aria-label", `Remove ${host}`);
      if (!lock.hidden) {
        remove.setAttribute("aria-describedby", lock.id);
      }
      remove.textContent = "×";

      actions.append(lock, remove);
      li.append(name, actions);
      blockList.append(li);
    });

    blockEmpty.hidden = settings.blockList.length > 0;
  }

  function setActive(selector, predicate) {
    root.querySelectorAll(selector).forEach((button) => {
      const isActive = predicate(button);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  async function patchSettings(patch) {
    window.clearTimeout(nameSaveTimer);
    settings = await saveSettings(patch);
    options.onAfterSave?.(settings);
    render(settings);
    return settings;
  }

  function saveClockColor() {
    patchSettings({ clockColor: clockColorInput.value });
  }

  function getLocked() {
    return options.isBlockLocked ? options.isBlockLocked(settings) : getFocusState(settings) === "focused";
  }

  function focusCurrentTab() {
    if (activeTab === "block") {
      blockInput.focus();
      return;
    }

    if (activeTab === "gadgets") {
      root.querySelector('[data-settings-panel="gadgets"] button')?.focus();
      return;
    }

    nameInput.focus();
  }

  return {
    render,
    focusCurrentTab,
    setActiveTab(tab) {
      activeTab = tab;
      render();
    }
  };
}

function formatScale(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return `${rounded.toFixed(2).replace(/\.?0+$/, "")}x`;
}
