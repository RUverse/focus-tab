# Focus Tab Contributor Guide

Focus Tab is a Chrome and Firefox new-tab extension with a local clock, focus
mode, distraction breaks, lightweight gadgets, and animated wave backgrounds.
See [README.md](./README.md) for behavior, permissions, and installation.

These instructions apply to the entire repository.

## Local environment

- Copy `.env.example` to `.env` and set `RUWAVES_DIR` to the local Ruwaves
  checkout when working across both repositories.
- Keep machine-specific paths, hostnames, account names, and other personal
  workstation details only in `.env`, which is ignored by Git. Documentation
  and tracked configuration must use portable relative paths or environment
  variable names.

## Development

- Keep the extension source dependency-light and readable. Browser-facing
  source files are plain ESM, HTML, and CSS; only the wave entry is bundled.
- Run `npm test` while developing and `npm run build` before handoff. The build
  produces unpacked Chrome/Firefox directories and store-ready zip files under
  `dist/`, which is intentionally ignored.
- Load `dist/chrome` or `dist/firefox` for browser testing; the repository root
  is no longer a load-unpacked target because `wave-background.js` has a bare
  package import before the build bundles it.
- Preserve user settings and focus state. Normalize every stored value in
  `shared.js`, tolerate legacy/malformed storage, and keep Chrome storage and
  localStorage fallback behavior aligned.
- Keep Chrome and Firefox behavior sourced from one `manifest.json` and one set
  of application files. Firefox-only manifest differences belong in
  `build.mjs`.

## Product and security invariants

- Keep permissions minimal. Do not add host permissions, content scripts,
  remote code, CDN assets, telemetry, or network data collection without an
  explicit product and privacy decision.
- Blocking state and all personal settings remain local to the browser. Never
  send block lists, break reasons, sticky notes, browsing context, or media-tab
  details to an external service.
- Preserve the extension content security policy. Bundled dependencies must be
  part of the generated extension package.
- The background worker owns blocking enforcement and timed-break recovery.
  UI files request state changes through the shared storage contract rather
  than maintaining a second authoritative state.
- The interface follows the operating system color scheme. Custom clock color
  is an override; removing it returns to the current system-theme default.
- Accessibility, keyboard operation, reduced motion, readable contrast, and
  useful empty/error states are part of a finished UI change.

## Wave background integration

- Focus Tab consumes `@ruverse/waves` from the checkout identified by
  `RUWAVES_DIR` through a local file dependency until version `0.1.0` is
  published.
- Focus Tab owns preset IDs, labels, and values in `wave-background.js`; the
  package owns normalization and rendering.
- Keep backgrounds non-interactive, transparent, behind every UI element, and
  theme-aware. Off removes the canvas, Random selects once per new-tab page,
  and pinned presets remain stable.
- `build.mjs` must bundle the wave entry into both extension targets. No bare
  `@ruverse/waves` import may remain in either packaged zip.
- The release workflow pins the exact Ruwaves Git commit used for packaging.
  Update `RUWAVES_COMMIT` in `.github/workflows/release.yml` whenever Focus Tab
  starts relying on a newer sibling runtime. Once the npm dependency replaces
  `file:`, remove the temporary checkout/build step from that workflow.
- The release workflow fetches its pinned Ruwaves commit from the public
  organization repository. Keep that URL organization-owned and never replace
  it with a personal-account repository endpoint.

## Code map

- `shared.js`: settings defaults, validation, persistence, focus-state helpers
- `newtab.js` / `newtab.html` / `newtab.css`: clock page and core presentation
- `focus.js` / `background.js`: focus sessions, breaks, and blocking enforcement
- `settings-panel.js` / `popup.js`: reusable settings UI surfaces
- `wave-background.js`: preset inventory and package mounting
- `fidget.js` / `sticky-note.js`: optional draggable gadgets
- `build.mjs`: Chrome/Firefox packaging and wave bundling

## Change workflow

- Use `dev` as the integration branch. Start feature and fix branches from the
  latest `dev`, and open their pull requests into `dev`.
- Do not merge ordinary features or fixes directly into `main`. Keep `main`
  release-only.
- Move accumulated changes from `dev` to `main` through one release pull
  request that also contains the version bump. Do not create a separate
  version-only branch or pull request.
- Keep pull requests focused, describe user-visible behavior, and report only
  verification that was actually performed.
- Preserve unrelated working-tree changes and never use destructive Git cleanup
  as part of normal development.

## Testing

Run the deterministic checks first:

```sh
npm test
npm run build
git diff --check
```

For UI changes, load the built unpacked extension or serve
`dist/chrome/newtab.html` locally. Verify the affected controls in both system
themes, inspect the browser console, and check that settings survive reload.
For wave changes, also verify Off, Random, every pinned preset, resizing,
stacking, reduced motion, and that only one canvas/animation instance remains.

Inspect release archives when packaging changes:

```sh
unzip -l dist/chrome.zip
unzip -l dist/firefox.zip
```

The zips must have files at their root, contain the bundled
`wave-background.js`, and contain no remote or bare package imports.

## Preparing a release

When the user asks to prepare a release:

- Confirm the intended numeric semantic version; do not guess it. Chrome
  manifest versions must use one to four dot-separated integers, so use a value
  such as `1.2.0` without a `v` prefix or prerelease suffix.
- Make sure `dev` is clean, current with `origin/dev`, and contains only the
  changes intended for the release.
- On `dev`, run `npm version <version> --no-git-tag-version`. The version hook
  synchronizes `manifest.json`; confirm `package.json`, `package-lock.json`, and
  `manifest.json` all contain the same version.
- Run `npm test` and `npm run build`, then commit and push the version bump to
  `dev`.
- Open one release pull request from `dev` into `main`. Include accumulated
  user-visible changes, the version bump, and only verification actually run.
  Leave it for review; do not merge unless the user explicitly asks.
- After that pull request is merged, update local `main`, verify the three
  version files again, and create an annotated tag on the merged `main` commit:

  ```sh
  git tag -a <version> -m "Release <version>"
  git push origin <version>
  ```

- The tag must exactly match `manifest.json` without a `v` prefix. Its push
  triggers `.github/workflows/release.yml`, which tests and builds both browser
  packages, attests their provenance, and creates a draft GitHub Release with
  both zip files attached.
- Verify that the workflow was triggered and report its result. Do not publish
  the draft release unless the user explicitly asks.
- Provide copy-ready release notes based on user-visible changes since the
  previous tag, with features before fixes and no empty section:

  ```markdown
  ## New features

  - Added ...

  ## Fixes

  - Fixed ...
  ```
