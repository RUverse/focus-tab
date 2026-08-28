#!/usr/bin/env node

import { createSign } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ORIGIN = "https://chromewebstore.googleapis.com";
const API_SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const JWT_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function createServiceAccountAssertion(credentials, nowSeconds = Math.floor(Date.now() / 1000)) {
  const clientEmail = requireString(credentials?.client_email, "Service-account client_email");
  const privateKey = requireString(credentials?.private_key, "Service-account private_key");
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: API_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsignedAssertion = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedAssertion);
  signer.end();
  return `${unsignedAssertion}.${signer.sign(privateKey, "base64url")}`;
}

async function readJsonResponse(response, operation) {
  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }
  }

  if (!response.ok) {
    const detail = body?.error?.message || body?.raw || response.statusText || "Unknown error";
    throw new Error(`${operation} failed (${response.status}): ${detail}`);
  }

  return body;
}

async function requestJson(fetchImpl, url, options, operation) {
  return readJsonResponse(await fetchImpl(url, options), operation);
}

function normalizeUploadState(value) {
  return String(value || "").replace(/^UPLOAD_/, "");
}

function revisionVersion(revision) {
  const channels = Array.isArray(revision?.distributionChannels) ? revision.distributionChannels : [];
  return channels.map((channel) => channel?.crxVersion).find(Boolean) || "";
}

async function obtainAccessToken({ credentials, fetchImpl, nowSeconds }) {
  const assertion = createServiceAccountAssertion(credentials, nowSeconds);
  const response = await requestJson(fetchImpl, TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion }),
  }, "Chrome Web Store authentication");

  return requireString(response.access_token, "OAuth access token");
}

async function waitForUpload({ fetchImpl, statusUrl, headers, initialState, sleep, maxPollAttempts }) {
  let state = normalizeUploadState(initialState);

  if (state === "SUCCEEDED") return;
  if (state === "FAILED") throw new Error("Chrome Web Store package validation failed.");

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    if (!["IN_PROGRESS", "NOT_FOUND", "STATE_UNSPECIFIED", ""].includes(state)) {
      throw new Error(`Unexpected Chrome Web Store upload state: ${state}`);
    }

    await sleep(5000);
    const status = await requestJson(fetchImpl, statusUrl, { headers }, "Chrome Web Store upload status");
    state = normalizeUploadState(status.lastAsyncUploadState);

    if (state === "SUCCEEDED") return;
    if (state === "FAILED") throw new Error("Chrome Web Store package validation failed.");
  }

  throw new Error("Chrome Web Store package validation did not finish within two minutes.");
}

export async function publishChrome({
  env = process.env,
  fetchImpl = globalThis.fetch,
  readFile = fs.readFile,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  nowSeconds = Math.floor(Date.now() / 1000),
  maxPollAttempts = 24,
  logger = console,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const publisherId = requireString(env.CHROME_PUBLISHER_ID, "CHROME_PUBLISHER_ID");
  const extensionId = requireString(env.CHROME_EXTENSION_ID, "CHROME_EXTENSION_ID");
  const archivePath = requireString(env.CHROME_ZIP_PATH || "dist/chrome.zip", "CHROME_ZIP_PATH");
  const releaseVersion = requireString(env.RELEASE_VERSION, "RELEASE_VERSION");

  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("CHROME_EXTENSION_ID is malformed.");
  if (!/^\d+(?:\.\d+){0,3}$/.test(releaseVersion)) throw new Error("RELEASE_VERSION is malformed.");

  let credentials;
  try {
    credentials = JSON.parse(requireString(env.CHROME_SERVICE_ACCOUNT_JSON, "CHROME_SERVICE_ACCOUNT_JSON"));
  } catch (error) {
    throw new Error(`CHROME_SERVICE_ACCOUNT_JSON is invalid JSON: ${error.message}`);
  }

  const token = await obtainAccessToken({ credentials, fetchImpl, nowSeconds });
  const headers = { authorization: `Bearer ${token}` };
  const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${extensionId}`;
  const uploadUrl = `${API_ORIGIN}/upload/v2/${itemName}:upload`;
  const statusUrl = `${API_ORIGIN}/v2/${itemName}:fetchStatus`;
  const publishUrl = `${API_ORIGIN}/v2/${itemName}:publish`;
  const existingStatus = await requestJson(fetchImpl, statusUrl, { headers }, "Chrome Web Store status");
  const publishedVersion = revisionVersion(existingStatus.publishedItemRevisionStatus);
  const submittedVersion = revisionVersion(existingStatus.submittedItemRevisionStatus);

  if (publishedVersion === releaseVersion) {
    logger.info(`Chrome Web Store version ${releaseVersion} is already published.`);
    return { status: existingStatus, alreadySubmitted: true };
  }
  if (submittedVersion === releaseVersion) {
    const state = existingStatus.submittedItemRevisionStatus?.state || "ITEM_STATE_UNSPECIFIED";
    if (["PENDING_REVIEW", "STAGED", "PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(state)) {
      logger.info(`Chrome Web Store version ${releaseVersion} is already in state ${state}.`);
      return { status: existingStatus, alreadySubmitted: true };
    }
    throw new Error(`Chrome Web Store version ${releaseVersion} already has submission state ${state}; resolve it in the Developer Dashboard before retrying.`);
  }

  const archive = await readFile(archivePath);
  const upload = await requestJson(fetchImpl, uploadUrl, {
    method: "POST",
    headers: { ...headers, "content-type": "application/zip" },
    body: archive,
  }, "Chrome Web Store upload");

  if (upload.crxVersion && upload.crxVersion !== releaseVersion) {
    throw new Error(`Chrome Web Store read package version ${upload.crxVersion}; expected ${releaseVersion}.`);
  }

  await waitForUpload({
    fetchImpl,
    statusUrl,
    headers,
    initialState: upload.uploadState,
    sleep,
    maxPollAttempts,
  });
  logger.info(`Chrome Web Store accepted package ${releaseVersion}.`);

  const submission = await requestJson(fetchImpl, publishUrl, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
  }, "Chrome Web Store submission");

  const warnings = submission?.warningsInfo?.warnings || submission?.warnings || [];
  for (const warning of warnings) {
    logger.warn(`Chrome Web Store warning: ${warning.description || warning.reason || "Unspecified warning"}`);
  }
  logger.info("Chrome Web Store submission is awaiting review and will publish automatically after approval.");

  return { upload, submission };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  publishChrome().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
