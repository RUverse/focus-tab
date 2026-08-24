import { promises as fs } from "node:fs";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
const version = String(packageJson.version || "");

if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
  throw new Error(
    `Version ${JSON.stringify(version)} is not a valid browser-extension version. ` +
    "Use one to four dot-separated integers without a v prefix or prerelease suffix."
  );
}

manifest.version = version;
await fs.writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
