import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createAmoJwt, publishFirefox } from "../scripts/publish-firefox.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function testEnv() {
  return {
    AMO_JWT_ISSUER: "user:123:456",
    AMO_JWT_SECRET: "amo-secret",
    FIREFOX_ZIP_PATH: "dist/firefox.zip",
    FIREFOX_SOURCE_PATH: "dist/focus-tab-1.2.0-source.zip",
    AMO_METADATA_PATH: "dist/amo-metadata.json",
    FIREFOX_MANIFEST_PATH: "dist/firefox/manifest.json",
    RELEASE_VERSION: "1.2.0",
  };
}

function fakeReadFile(filePath) {
  if (filePath.endsWith("amo-metadata.json")) {
    return JSON.stringify({ version: { release_notes: { "en-US": "Release notes" } } });
  }
  if (filePath.endsWith("manifest.json")) {
    return JSON.stringify({
      version: "1.2.0",
      browser_specific_settings: { gecko: { id: "focus-clock@paydargraphics" } },
    });
  }
  return Buffer.from(filePath);
}

test("AMO JWT is short-lived, unique, and signed with HMAC-SHA256", () => {
  const token = createAmoJwt({
    issuer: "user:123:456",
    secret: "amo-secret",
    nowSeconds: 1_800_000_000,
    nonce: "unique-request-id",
  });
  const [header, payload, signature] = token.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "HS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iss: "user:123:456",
    jti: "unique-request-id",
    iat: 1_800_000_000,
    exp: 1_800_000_060,
  });
  assert.equal(signature, createHmac("sha256", "amo-secret").update(`${header}.${payload}`).digest("base64url"));
});

test("Firefox publishing validates the package, submits source, and applies release notes", async () => {
  const calls = [];
  const responses = [
    jsonResponse({}, 404),
    jsonResponse({ uuid: "upload-uuid", processed: false }),
    jsonResponse({ uuid: "upload-uuid", processed: true, valid: true, version: "1.2.0" }),
    jsonResponse({ id: 123, version: "1.2.0", source: "https://example.test/source.zip" }, 201),
    jsonResponse({ id: 123, version: "1.2.0" }),
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };
  await publishFirefox({
    env: testEnv(),
    fetchImpl,
    readFile: fakeReadFile,
    sleep: async () => {},
    nowSeconds: () => 1_800_000_000,
    nonce: (() => { let value = 0; return () => `nonce-${value += 1}`; })(),
    logger: { info() {} },
  });

  assert.equal(calls.length, 5);
  assert.equal(calls[0].url, "https://addons.mozilla.org/api/v5/addons/addon/focus-clock%40paydargraphics/versions/v1.2.0/");
  assert.equal(calls[1].url, "https://addons.mozilla.org/api/v5/addons/upload/");
  assert.equal(calls[2].url, "https://addons.mozilla.org/api/v5/addons/upload/upload-uuid/");
  assert.equal(calls[3].url, "https://addons.mozilla.org/api/v5/addons/addon/focus-clock%40paydargraphics/versions/");
  assert.equal(calls[3].options.body.get("upload"), "upload-uuid");
  assert.equal(calls[4].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[4].options.body), { release_notes: { "en-US": "Release notes" } });
  for (const call of calls) assert.match(call.options.headers.get("authorization"), /^JWT /);
});

test("Firefox publishing stops when AMO validation fails", async () => {
  const responses = [
    jsonResponse({}, 404),
    jsonResponse({
      uuid: "upload-uuid",
      processed: true,
      valid: false,
      validation: { messages: [{ type: "error", message: "Invalid manifest" }] },
    }),
  ];
  await assert.rejects(() => publishFirefox({
    env: testEnv(),
    fetchImpl: async () => responses.shift(),
    readFile: fakeReadFile,
    logger: { info() {} },
  }), /Invalid manifest/);
});

test("Firefox publishing repairs an existing submission without uploading the package again", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ id: 123, version: "1.2.0", source: null }),
    jsonResponse({ id: 123, version: "1.2.0", source: "https://example.test/source.zip" }),
    jsonResponse({ id: 123, version: "1.2.0" }),
  ];
  await publishFirefox({
    env: testEnv(),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return responses.shift();
    },
    readFile: fakeReadFile,
    logger: { info() {} },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.method, "PATCH");
  assert.ok(calls[1].options.body instanceof FormData);
  assert.equal(calls[2].options.method, "PATCH");
  assert.equal(calls.some((call) => call.url.endsWith("/addons/upload/")), false);
});
