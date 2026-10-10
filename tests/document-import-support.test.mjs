import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const mediaView = await readFile(new URL("../src/media-library-view.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/media-library.css", import.meta.url), "utf8");

test("Media Library keeps private RPC boundary for documents", () => {
  assert.match(app, /get_staff_media_assets/);
  assert.match(app, /import\("\.\/media-library-view"\)/);
  assert.match(mediaView, /fetchStaffMediaSignedUrl/);
  assert.match(mediaView, /openStaffMediaAsset/);
  assert.doesNotMatch(mediaView, /create_staff_media_asset_record/);
  assert.doesNotMatch(mediaView, /\/rest\/v1\/media_assets[^\n]*(PATCH|PUT|DELETE|POST)/i);
});

test("Media Library exposes document asset type without public preview URLs", () => {
  assert.match(mediaView, /"other"/);
  assert.match(mediaView, /Document/);
  assert.match(mediaView, /مستند/);
  assert.match(mediaView, /documentPreviewPrivate/);
  assert.match(mediaView, /documentOpen/);
  assert.match(mediaView, /documentDownload/);
  assert.doesNotMatch(mediaView, /drive\.google\.com/i);
});

test("document storage path contract uses staff-owned private prefix in UI", () => {
  assert.match(css, /media-other/);
  assert.match(mediaView, /media-document-actions/);
});
