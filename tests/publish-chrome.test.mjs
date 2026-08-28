import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createServiceAccountAssertion, publishChrome } from "../scripts/publish-chrome.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
const credentials = {
  client_email: "publisher@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function testEnv() {
  return {
    CHROME_PUBLISHER_ID: "4662d281-846f-457a-9f65-8fb18ca9f292",
    CHROME_EXTENSION_ID: "dhkapihaomieoiihekjdnncdekhmfgaj",
    CHROME_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
    CHROME_ZIP_PATH: "dist/chrome.zip",
    RELEASE_VERSION: "1.2.0",
  };
}

test("service-account assertion has scoped, short-lived claims and a valid signature", () => {
  const assertion = createServiceAccountAssertion(credentials, 1_800_000_000);
  const [header, payload, signature] = assertion.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/chromewebstore",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  });

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature, "base64url"), true);
});

test("Chrome publishing authenticates, waits for validation, and requests default publishing", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ access_token: "short-lived-token" }),
    jsonResponse({}),
    jsonResponse({ uploadState: "IN_PROGRESS" }),
    jsonResponse({ lastAsyncUploadState: "SUCCEEDED" }),
    jsonResponse({}),
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };

  await publishChrome({
    env: testEnv(),
    fetchImpl,
    readFile: async () => Buffer.from("extension archive"),
    sleep: async () => {},
    nowSeconds: 1_800_000_000,
    logger: { info() {}, warn() {} },
  });

  assert.equal(calls.length, 5);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[1].url, "https://chromewebstore.googleapis.com/v2/publishers/4662d281-846f-457a-9f65-8fb18ca9f292/items/dhkapihaomieoiihekjdnncdekhmfgaj:fetchStatus");
  assert.equal(calls[2].url, "https://chromewebstore.googleapis.com/upload/v2/publishers/4662d281-846f-457a-9f65-8fb18ca9f292/items/dhkapihaomieoiihekjdnncdekhmfgaj:upload");
  assert.equal(calls[3].url, "https://chromewebstore.googleapis.com/v2/publishers/4662d281-846f-457a-9f65-8fb18ca9f292/items/dhkapihaomieoiihekjdnncdekhmfgaj:fetchStatus");
  assert.equal(calls[4].url, "https://chromewebstore.googleapis.com/v2/publishers/4662d281-846f-457a-9f65-8fb18ca9f292/items/dhkapihaomieoiihekjdnncdekhmfgaj:publish");
  assert.equal(calls[2].options.headers.authorization, "Bearer short-lived-token");
  assert.deepEqual(JSON.parse(calls[4].options.body), { publishType: "DEFAULT_PUBLISH" });
});

test("Chrome publishing is a no-op when the release is already awaiting review", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ access_token: "short-lived-token" }),
    jsonResponse({
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels: [{ crxVersion: "1.2.0", deployPercentage: 100 }],
      },
    }),
  ];

  const result = await publishChrome({
    env: testEnv(),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return responses.shift();
    },
    readFile: async () => { throw new Error("archive should not be read"); },
    logger: { info() {}, warn() {} },
  });

  assert.equal(result.alreadySubmitted, true);
  assert.equal(calls.length, 2);
});

test("Chrome publishing stops when package validation fails", async () => {
  const responses = [
    jsonResponse({ access_token: "short-lived-token" }),
    jsonResponse({}),
    jsonResponse({ uploadState: "FAILED" }),
  ];

  await assert.rejects(() => publishChrome({
    env: testEnv(),
    fetchImpl: async () => responses.shift(),
    readFile: async () => Buffer.from("extension archive"),
    logger: { info() {}, warn() {} },
  }), /package validation failed/);
});
