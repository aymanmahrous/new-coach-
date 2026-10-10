import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const analysis = await readFile(new URL("../src/media-ai-analysis.ts", import.meta.url), "utf8");
const batchLink = await readFile(new URL("../src/media-batch-link.ts", import.meta.url), "utf8");

test("local analysis stays heuristic and flags Gemini NOT CONNECTED", () => {
  assert.match(analysis, /providerConnected: false/);
  assert.match(analysis, /suitabilityVerdict/);
  assert.match(analysis, /editSuggestion/);
  assert.match(analysis, /Gemini API NOT CONNECTED/);
  assert.match(analysis, /containsChildrenGuess/);
  assert.match(analysis, /Consent Required/);
});

test("batch media linker falls back to pending plans when no eligible media", () => {
  assert.match(batchLink, /mediaSource: "pending"/);
  assert.match(batchLink, /buildFallbackAssetPlan/);
  assert.match(batchLink, /canUseInMarketingBatch/);
  assert.match(batchLink, /top\.score > 0/);
});
