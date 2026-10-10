import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const view = await readFile(new URL("../src/massive-archive-view.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

test("massive archive launches Google Drive directly without iframe or processing", () => {
  assert.match(view, /VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL/);
  assert.match(view, /target="_blank"/);
  assert.match(view, /rel="noopener noreferrer"/);
  assert.match(view, /navigator\.clipboard\.writeText/);
  assert.match(view, /archive-launcher-grid/);
  assert.doesNotMatch(view, /<iframe|embeddedfolderview/i);
  assert.doesNotMatch(view, /fetchArchiveIndexPage|get_staff_archive_index_page/);
  assert.doesNotMatch(view, /genai|openai|vision|analyze|embedding/i);
  assert.doesNotMatch(view, /upload|multipart|FormData/i);
});

test("hub keeps archive section alongside media library", () => {
  assert.match(main, /\["archive", Library/);
  assert.match(main, /\["media", Library/);
  assert.match(main, /lazy\(\(\) => import\("\.\/massive-archive-view"\)\)/);
});

test("drive folder url is configured via public env example only", () => {
  assert.match(envExample, /VITE_MASSIVE_ARCHIVE_DRIVE_FOLDER_URL/);
});
