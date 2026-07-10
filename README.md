# New tab for the focused

inspired by WHA Quotes & Clock New Tab Clone (not maintained anymore)

A dependency-free Chrome extension inspired by the old WHA Quotes & Clock New Tab extension.

## Features

- Chrome new-tab override
- Dark and Light modes
- Live local clock with optional seconds and 24-hour format
- Custom accent color, with a reset to the theme default
- Optional progress bars for the day, month, and year
- Optional new-tab gadgets: motivational quotes, fidget toys, and a sticky note list
- Greeting and date
- Rotating motivational quotes
- **Focus mode**: a Focus button below the quote. Build a block list of sites. while focused those sites can't be opened and are redirected to this page instead.
- **Distraction breaks**: from the focused view, open the break picker and drag
  the dial to set 1 minute – 4 hours. During a break the blocked sites open
  normally and the new tab shows a `DISTRACTED` indicator counting down.
- **For later**: when a tab is parked on the focus page by the blocker, it shows
  the blocked page's title (falling back to its host) and sets the tab title to
  match, so blocked tabs stay identifiable in the tab strip. The original page
  is reopened automatically once a break starts or focus ends.
- **Now playing**: a panel (top-right) listing tabs currently playing sound,
  each with its favicon and title. Click one to switch to it, or mute/unmute it
  in place. Updates live and hides when nothing is playing.
- Gear button (bottom-right) to edit the block list and other settings at any time.
- Settings saved with `chrome.storage.local`; blocking enforced by a background
  service worker that watches navigations (`webNavigation`/`tabs`) and redirects
  any blocked page — including tabs that are already open — to the focus page.

## Permissions

The extension keeps its permissions minimal and requests **no host permissions**,
so it does not trigger the Chrome Web Store's in-depth host-permission review:

- `storage` — save your settings locally.
- `alarms` — re-enable blocking when a timed break ends.
- `tabs` — read tab URLs to enforce blocks, and read the title/icon/audio state
  of audible tabs for the "Now playing" panel.
- `webNavigation` — catch navigation to a blocked site before it loads.

No data is collected or transmitted; everything stays on your device. The
"Now playing" panel shows playing tabs but cannot read media metadata (song,
artist, artwork) or pause playback, since that would require injecting code
into pages and broad host access.

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

## Building from source (Chrome & Firefox)

The published packages are produced from the source in this repository by
`build.mjs`. No source files are minified, transpiled, or concatenated; the
script copies the JS/CSS/HTML verbatim and only generates `manifest.json` for
each target (the Firefox build swaps the background to module scripts and adds
the `browser_specific_settings.gecko` block).

### Build environment

- **OS:** any (macOS, Linux, or Windows) — the script uses only the Node
  standard library and the system `zip` command.
- **Node.js:** 18 or newer (developed and tested on Node 22.23.0).
- **npm:** any version bundled with the above Node (used only to run the
  scripts; there are no third-party dependencies to install).
- **`zip`:** the Info-ZIP `zip` CLI, used to package the output. Present by
  default on macOS and most Linux distros.

### Steps

```sh
# 1. From the repository root, build both targets:
npm run build            # or: node build.mjs

# Build a single target instead:
npm run build:firefox    # or: node build.mjs firefox
npm run build:chrome     # or: node build.mjs chrome
```

This writes the unpacked extension to `dist/<target>/` and a store-ready
archive to `dist/<target>.zip`. `dist/firefox.zip` is the file uploaded to
AMO; `dist/firefox/` contains the exact, human-readable files it holds.
