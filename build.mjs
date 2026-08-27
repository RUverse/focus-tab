#!/usr/bin/env node
// Packs the extension for the Chrome Web Store and Firefox (AMO) from a single
// source of truth: manifest.json (the Chrome manifest, also used for `load
// unpacked` during development). Firefox-specific differences are applied here
// rather than maintained as a second hand-edited manifest.
//
// Usage:
//   node build.mjs            # build both targets
//   node build.mjs chrome     # build one target
//   node build.mjs firefox
//
// Output: dist/<target>/ (unpacked) and dist/<target>.zip (store upload).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build as bundle } from "esbuild";

const execFileP = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");

// Files copied verbatim into every package. Docs (README/PRIVACY) and build
// tooling are intentionally excluded.
const ASSETS = [
  "background.js",
  "fidget.js",
  "focus.js",
  "newtab.js",
  "sticky-note.js",
  "popup.js",
  "settings-panel.js",
  "shared.js",
  "newtab.html",
  "popup.html",
  "newtab.css",
  "popup.css",
  "icons",
];

// Minimum Firefox version: data_collection_permissions is only recognized from
// Firefox 140 (desktop) / 142 (Android), so 142 is the floor that satisfies
// both and keeps AMO validation warning-free.
const GECKO_ID = "focus-clock@paydargraphics";
const FIREFOX_MIN_VERSION = "142.0";

function firefoxManifest(base) {
  const m = structuredClone(base);

  // Firefox's MV3 background runs as an event page from background.scripts,
  // not a service worker. ES-module imports are supported via type:module.
  m.background = { scripts: ["background.js"], type: "module" };

  // AMO requires a stable add-on id and benefits from a pinned floor version.
  // data_collection_permissions is mandatory for new submissions since
  // 2025-11-03 (and recognized from Firefox 140+); "none" declares the add-on
  // collects no user data, matching this extension's local-only storage
  // behavior (see PRIVACY.md).
  m.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: { required: ["none"] },
    },
  };

  // Chrome-only keys: Firefox ignores them but warns during validation.
  delete m.minimum_chrome_version;
  delete m.offline_enabled;

  return m;
}

const TARGETS = {
  chrome: (base) => base,
  firefox: firefoxManifest,
};

async function copyAsset(name, outDir) {
  await fs.cp(path.join(root, name), path.join(outDir, name), {
    recursive: true,
  });
}

async function bundleWaveBackground(outDir) {
  await bundle({
    entryPoints: [path.join(root, "wave-background.js")],
    outfile: path.join(outDir, "wave-background.js"),
    bundle: true,
    format: "esm",
    target: ["chrome102", "firefox142"],
    minify: true,
    sourcemap: false,
    legalComments: "none"
  });
}

async function bundleWaveConfig(outDir) {
  await bundle({
    entryPoints: [path.join(root, "wave-config.js")],
    outfile: path.join(outDir, "wave-config.js"),
    bundle: true,
    format: "esm",
    target: ["chrome102", "firefox142"],
    minify: true,
    sourcemap: false,
    legalComments: "none"
  });
}

async function build(target) {
  const transform = TARGETS[target];
  if (!transform) {
    throw new Error(`Unknown target "${target}". Use: ${Object.keys(TARGETS).join(", ")}`);
  }

  const base = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const manifest = transform(base);

  const outDir = path.join(distDir, target);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await Promise.all(ASSETS.map((name) => copyAsset(name, outDir)));
  await Promise.all([
    bundleWaveBackground(outDir),
    bundleWaveConfig(outDir)
  ]);
  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // Zip from inside outDir so paths are relative to the package root (stores
  // reject zips with a wrapping top-level folder).
  const zipPath = path.join(distDir, `${target}.zip`);
  await fs.rm(zipPath, { force: true });
  await execFileP("zip", ["-r", "-X", zipPath, "."], { cwd: outDir });

  const v = manifest.version;
  console.log(`✓ ${target}: dist/${target}/ and dist/${target}.zip (v${v})`);
}

const requested = process.argv.slice(2);
const targets = requested.length ? requested : Object.keys(TARGETS);

for (const t of targets) {
  await build(t);
}
