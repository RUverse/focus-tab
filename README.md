# New tab for the focused

inspired by WHA Quotes & Clock New Tab Clone

A dependency-free Chrome extension inspired by the old WHA Quotes & Clock New Tab extension.

## Features

- Chrome new-tab override
- Dark and Light modes
- Live local clock with optional seconds and 24-hour format
- Greeting and date
- Rotating motivational quotes
- **Focus mode**: a Focus button below the quote. Build a block list of sites
  (e.g. `x.com`); while focused those sites can't be opened and are redirected
  to this page instead.
- **Distraction breaks**: from the focused view, open the break picker and drag
  the dial to set 1 minute – 4 hours. During a break the blocked sites open
  normally and the new tab shows a `DISTRACTED` indicator counting down.
- Gear button (bottom-right) to edit the block list at any time.
- Settings saved with `chrome.storage.local`; blocking enforced by a background
  service worker that watches navigations (`webNavigation`/`tabs`) and redirects
  any blocked page — including tabs that are already open — to the focus page.

## How focus mode works

- Clicking **Focus** the first time opens the block-list editor. Add sites and
  press *Start focus*.
- While focused, the page shows **Focused.** plus a button to start a break.
- Starting a break sets `distractionUntil`; the background worker drops the
  blocking rules until it elapses, then restores them automatically.
- Clicking **Focus** during a break ends it early and resumes blocking.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this folder.

The extension will replace Chrome's new tab page after it is loaded.
