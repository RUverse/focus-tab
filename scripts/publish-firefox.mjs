#!/usr/bin/env node

import { createHmac, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_BASE = "https://addons.mozilla.org/api/v5";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function createAmoJwt({ issuer, secret, nowSeconds = Math.floor(Date.now() / 1000), nonce = randomUUID() }) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: requireString(issuer, "AMO JWT issuer"),
    jti: requireString(nonce, "AMO JWT nonce"),
    iat: nowSeconds,
    exp: nowSeconds + 60,
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", requireString(secret, "AMO JWT secret"))
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

async function readJsonResponse(response, operation, { allowNotFound = false } = {}) {
  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }
  }

  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const detail = body?.detail || body?.error || body?.raw || response.statusText || "Unknown error";
    throw new Error(`${operation} failed (${response.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }

  return body;
}

function validationErrors(validation) {
  const messages = Array.isArray(validation?.messages) ? validation.messages : [];
  return messages
    .filter((message) => message?.type === "error" || message?.type === "warning")
    .slice(0, 5)
    .map((message) => message.message || message.description)
    .filter(Boolean)
    .join("; ");
}

export async function publishFirefox({
  env = process.env,
  fetchImpl = globalThis.fetch,
  readFile = fs.readFile,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  nowSeconds = () => Math.floor(Date.now() / 1000),
  nonce = randomUUID,
  maxPollAttempts = 60,
  logger = console,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const issuer = requireString(env.AMO_JWT_ISSUER, "AMO_JWT_ISSUER");
  const secret = requireString(env.AMO_JWT_SECRET, "AMO_JWT_SECRET");
  const archivePath = requireString(env.FIREFOX_ZIP_PATH || "dist/firefox.zip", "FIREFOX_ZIP_PATH");
  const sourcePath = requireString(env.FIREFOX_SOURCE_PATH, "FIREFOX_SOURCE_PATH");
  const metadataPath = requireString(env.AMO_METADATA_PATH || "dist/amo-metadata.json", "AMO_METADATA_PATH");
  const manifestPath = requireString(env.FIREFOX_MANIFEST_PATH || "dist/firefox/manifest.json", "FIREFOX_MANIFEST_PATH");
  const releaseVersion = requireString(env.RELEASE_VERSION, "RELEASE_VERSION");

  if (!/^\d+(?:\.\d+){0,3}$/.test(releaseVersion)) throw new Error("RELEASE_VERSION is malformed.");

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const releaseNotes = metadata?.version?.release_notes;
  if (!releaseNotes?.["en-US"]) throw new Error("AMO metadata must contain English release notes.");
  const approvalNotes = requireString(metadata?.version?.approval_notes, "AMO approval notes");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const addonId = requireString(manifest?.browser_specific_settings?.gecko?.id, "Firefox manifest add-on ID");
  if (manifest.version !== releaseVersion) {
    throw new Error(`Firefox manifest version ${manifest.version}; expected ${releaseVersion}.`);
  }

  const authorization = () => `JWT ${createAmoJwt({
    issuer,
    secret,
    nowSeconds: nowSeconds(),
    nonce: nonce(),
  })}`;
  const request = async (url, options, operation, responseOptions) => {
    const headers = new Headers(options?.headers || {});
    headers.set("authorization", authorization());
    return readJsonResponse(await fetchImpl(url, { ...options, headers }), operation, responseOptions);
  };

  const encodedAddonId = encodeURIComponent(addonId);
  const encodedVersion = encodeURIComponent(`v${releaseVersion}`);
  const versionsUrl = `${API_BASE}/addons/addon/${encodedAddonId}/versions/`;
  const versionUrl = `${versionsUrl}${encodedVersion}/`;
  const existingVersion = await request(versionUrl, {}, "AMO version lookup", { allowNotFound: true });
  const sourceArchive = await readFile(sourcePath);

  let version = existingVersion;
  if (!version) {
    const extensionArchive = await readFile(archivePath);
    const uploadForm = new FormData();
    uploadForm.append("upload", new Blob([extensionArchive], { type: "application/zip" }), path.basename(archivePath));
    uploadForm.append("channel", "listed");
    let upload = await request(`${API_BASE}/addons/upload/`, {
      method: "POST",
      body: uploadForm,
    }, "AMO package upload");
    const uploadId = requireString(upload.uuid, "AMO upload uuid");

    for (let attempt = 0; !upload.processed && attempt < maxPollAttempts; attempt += 1) {
      await sleep(5000);
      upload = await request(`${API_BASE}/addons/upload/${encodeURIComponent(uploadId)}/`, {}, "AMO validation status");
    }

    if (!upload.processed) throw new Error("AMO package validation did not finish within five minutes.");
    if (!upload.valid) {
      const details = validationErrors(upload.validation);
      throw new Error(`AMO package validation failed${details ? `: ${details}` : "."}`);
    }
    if (upload.version !== releaseVersion) {
      throw new Error(`AMO read package version ${upload.version}; expected ${releaseVersion}.`);
    }

    const versionForm = new FormData();
    versionForm.append("upload", uploadId);
    versionForm.append("source", new Blob([sourceArchive], { type: "application/zip" }), path.basename(sourcePath));
    version = await request(versionsUrl, {
      method: "POST",
      body: versionForm,
    }, "AMO version submission");
    logger.info(`AMO accepted Firefox package ${releaseVersion} with its source archive.`);
  } else if (!version.source) {
    const sourceForm = new FormData();
    sourceForm.append("source", new Blob([sourceArchive], { type: "application/zip" }), path.basename(sourcePath));
    version = await request(versionUrl, {
      method: "PATCH",
      body: sourceForm,
    }, "AMO source upload");
    logger.info(`AMO version ${releaseVersion} already existed; its source archive was added.`);
  } else {
    logger.info(`AMO version ${releaseVersion} already exists with a source archive.`);
  }

  const updatedVersion = await request(versionUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approval_notes: approvalNotes, release_notes: releaseNotes }),
  }, "AMO release notes update");
  logger.info("AMO listed version is awaiting Mozilla review.");

  return updatedVersion;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  publishFirefox().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
