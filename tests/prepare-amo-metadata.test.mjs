import assert from "node:assert/strict";
import test from "node:test";

import { createAmoMetadata } from "../scripts/prepare-amo-metadata.mjs";

test("AMO metadata carries the published GitHub release notes", () => {
  assert.deepEqual(createAmoMetadata({ release: { body: "  ## New features\n\n- Added waves.  " } }), {
    version: {
      approval_notes: "The attached source archive is the exact tagged source. Run npm ci and npm run build; see the Building from source section in README.md.",
      release_notes: {
        "en-US": "## New features\n\n- Added waves.",
      },
    },
  });
});

test("AMO metadata rejects a published release without notes", () => {
  assert.throws(() => createAmoMetadata({ release: { body: "  " } }), /must contain release notes/);
});
