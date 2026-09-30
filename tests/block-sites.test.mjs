import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, normalizeHost, hostIsBlocked, loadSettings, saveSettings } from "../shared.js";

test("legacy lists include children and malformed exact-host settings normalize safely", () => {
  assert.deepEqual(normalizeSettings({ blockList: ["EXAMPLE.com", null, "example.com"] }).blockList, ["example.com"]);
  for (const blockExactHosts of [undefined, null, {}, false, "example.com"]) {
    assert.deepEqual(normalizeSettings({ blockList: ["example.com"], blockExactHosts }).blockExactHosts, []);
  }
  assert.deepEqual(normalizeSettings({ blockList: ["example.com"], blockExactHosts: [null, "EXAMPLE.com", "example.com", "absent.com"] }).blockExactHosts, ["example.com"]);
  assert.equal(normalizeHost("https://www.Example.com/path"), "www.example.com");
});

test("exact hosts exclude all descendants including www while retaining all paths", () => {
  const list = ["example.com"];
  for (const url of ["https://example.com", "http://example.com/a?b=c", "https://EXAMPLE.com:8080/a"]) {
    assert.equal(hostIsBlocked(url, list, list), true);
  }
  for (const url of ["https://www.example.com", "https://a.b.example.com"]) {
    assert.equal(hostIsBlocked(url, list), true);
    assert.equal(hostIsBlocked(url, list, list), false);
  }
  for (const url of ["https://notexample.com", "https://example.com.evil.test", "file:///example.com", "https://[", null]) {
    assert.equal(hostIsBlocked(url, list), false);
  }
  assert.equal(hostIsBlocked("https://example.com", ["www.example.com"]), false);
  assert.equal(hostIsBlocked("https://www.example.com", ["www.example.com"], ["www.example.com"]), true);
  assert.equal(hostIsBlocked("https://child.example.com", ["example.com", "child.example.com"], ["example.com"]), true);
});

test("both storage backends preserve exact-host choices and prune removed entries", async () => {
  for (const backend of ["local", "chrome"]) {
    let stored = {};
    globalThis.window = new EventTarget();
    if (backend === "chrome") {
      globalThis.chrome = { storage: { local: {
        get: (_, callback) => callback(stored),
        set: (value, callback) => { stored = value; callback(); }
      } } };
    } else {
      globalThis.localStorage = { getItem: () => stored.value ?? null, setItem: (_, value) => { stored.value = value; } };
    }
    try {
      await saveSettings({ blockList: ["example.com"], blockExactHosts: ["example.com"] });
      assert.deepEqual((await loadSettings()).blockExactHosts, ["example.com"]);
      await saveSettings({ name: "Test" });
      assert.deepEqual((await loadSettings()).blockExactHosts, ["example.com"]);
      await saveSettings({ blockList: [] });
      assert.deepEqual((await loadSettings()).blockExactHosts, []);
    } finally {
      delete globalThis.window;
      delete globalThis.chrome;
      delete globalThis.localStorage;
    }
  }
});
