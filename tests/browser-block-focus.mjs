// Run after npm run build with PLAYWRIGHT_MODULE pointing to playwright-core's
// index.mjs and CHROMIUM_PATH to an installed Chromium executable. No downloads.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright-core");
const profile = await mkdtemp(join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(), "block-focus-"));
const extension = resolve(process.env.EXTENSION_PATH || "dist/chrome");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-sandbox"]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  console.log(JSON.stringify({ browser: context.browser()?.version(), platform: process.platform, arch: process.arch, mode: "headless, unpacked Chrome extension" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checkbox = page.locator('[data-block-children][data-host="qa.test"]');
  const remove = page.locator('[data-block-remove][data-host="qa.test"]');
  const focused = (locator) => locator.evaluate((el) => document.activeElement === el);
  async function open(surface) {
    await page.goto(`chrome-extension://${id}/${surface}.html`);
    if (surface === "newtab") await page.locator("#gearButton").click();
    await page.locator('[data-settings-tab="block"]').click();
    await checkbox.waitFor();
  }
  for (const surface of ["popup", "newtab"]) {
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      await worker.evaluate(async () => chrome.storage.local.set({ blockList: ["qa.test"], blockExactHosts: [], focusActive: false, waveBackground: "off", shape: "boxy" }));
      await open(surface);
      for (const shape of ["boxy", "round"]) {
        await page.evaluate(async (shape) => chrome.storage.local.set({ shape }), shape);
        await page.waitForTimeout(100);
        for (const checked of [false, true]) {
          await checkbox.focus();
          await page.keyboard.press("Space");
          await page.waitForTimeout(500);
          assert.equal(await checkbox.isChecked(), checked);
          assert.equal(await focused(checkbox), true, `${surface}/${theme}/${shape}: Space focus`);
          assert.deepEqual(await page.evaluate(async () => (await chrome.storage.local.get("blockExactHosts")).blockExactHosts), checked ? [] : ["qa.test"]);
          await page.keyboard.press("Tab");
          assert.equal(await focused(remove), true);
          // A second window's storage write must preserve whichever row control
          // is now focused, rather than pulling focus back to the checkbox.
          await worker.evaluate(async () => chrome.storage.local.set({ name: `QA ${Date.now()}` }));
          await page.waitForTimeout(500);
          assert.equal(await focused(remove), true);
          await page.keyboard.press("Shift+Tab");
          assert.equal(await focused(checkbox), true);
          await open(surface);
          assert.equal(await checkbox.isChecked(), checked, "reload persistence");
        }
      }
      await checkbox.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(500);
      assert.equal(await focused(remove), true, "save must not steal Tab focus");
      await page.locator('[data-block-input]').focus();
      await worker.evaluate(async () => chrome.storage.local.set({ name: "Outside list" }));
      await page.waitForTimeout(500);
      assert.equal(await focused(page.locator('[data-block-input]')), true);
      await worker.evaluate(async () => chrome.storage.local.set({ focusActive: true }));
      await page.waitForTimeout(500);
      assert.equal(await checkbox.isDisabled(), true);
      const before = await checkbox.isChecked();
      await checkbox.dispatchEvent("change");
      await page.waitForTimeout(500);
      assert.equal(await checkbox.isChecked(), before, "locked value unchanged");
      console.log(`PASS ${surface} ${theme}: both shapes, toggles, navigation, reload, outside focus, lock`);
    }
  }
  assert.deepEqual(errors, [], "browser page errors");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
