import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const analysis = await readFile(new URL("../src/media-ai-analysis.ts", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/media-library-controls.tsx", import.meta.url), "utf8");

test("stored media analysis is normalized before rendering legacy Canva payloads", () => {
  assert.match(analysis, /export function readStoredMediaAnalysis/);
  assert.match(analysis, /recommendedPlatform/);
  assert.match(analysis, /asStringArray\(candidate\.suggestedFormats\)/);
  assert.match(analysis, /marketingNotes/);
});

test("media library controls use normalized analysis instead of unchecked casts", () => {
  assert.match(controls, /readStoredMediaAnalysis\(asset\.metadata\)/);
  assert.doesNotMatch(controls, /as MediaAnalysisResult \| null/);
});
