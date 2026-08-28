#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function createAmoMetadata(event) {
  const releaseNotes = String(event?.release?.body || "").trim();
  if (!releaseNotes) {
    throw new Error("The GitHub Release must contain release notes before it is published.");
  }

  return {
    version: {
      release_notes: {
        "en-US": releaseNotes,
      },
    },
  };
}

export async function writeAmoMetadata({
  eventPath = process.env.GITHUB_EVENT_PATH,
  outputPath = "dist/amo-metadata.json",
} = {}) {
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required.");
  const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
  const metadata = createAmoMetadata(event);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  writeAmoMetadata().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
