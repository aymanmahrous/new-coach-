import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../src/gemini-image-design-adapter.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-gemini-image/index.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/content-batch-review-panel.tsx", import.meta.url), "utf8");

test("Gemini image adapter keeps the API key server-side and calls the Edge Function", () => {
  assert.match(adapter, /functions\/v1\/generate-gemini-image/);
  assert.match(adapter, /estimateGeminiImageGeneration/);
  assert.match(adapter, /generateGeminiImageForContentItem/);
  assert.doesNotMatch(adapter, /GEMINI_API_KEY|VITE_GEMINI/i);
});

test("Gemini image Edge Function authenticates staff and uses the current low-cost image model", () => {
  assert.match(edge, /GEMINI_API_KEY/);
  assert.match(edge, /gemini-nano-banana-2\.1/);
  assert.match(edge, /v1beta\/interactions/);
  assert.match(edge, /requireStaff/);
  assert.match(edge, /GEMINI_CREDENTIAL_MISSING/);
  assert.match(edge, /estimatedCostUsd/);
});

test("estimate mode returns cost without sending a generation request", () => {
  const estimateStart = edge.indexOf('if (mode === "estimate")');
  const generateRequest = edge.indexOf("const response = await fetch(GEMINI_INTERACTIONS_URL", estimateStart);
  assert.ok(estimateStart >= 0 && generateRequest > estimateStart);
  const estimateBranch = edge.slice(estimateStart, generateRequest);
  assert.doesNotMatch(estimateBranch, /fetch\(|storage\.from|from\("media_assets"\)/);
});

test("target content is validated before the billable Google image request", () => {
  const targetRead = edge.indexOf('.from("content_items")');
  const providerRequest = edge.indexOf("fetch(GEMINI_INTERACTIONS_URL");
  assert.ok(targetRead >= 0 && providerRequest > targetRead);
  assert.match(edge, /CONTENT_ITEM_NOT_FOUND/);
  assert.match(edge, /PUBLISHED_CONTENT_IMMUTABLE/);
  assert.match(edge, /CONTENT_ITEM_READ_FAILED/);
});

test("generated image is stored as a reviewable asset, not published", () => {
  assert.match(edge, /source: "ai_generated"/);
  assert.match(edge, /provider: "google_gemini"/);
  assert.match(edge, /publishability_status: "ready_for_review"/);
  assert.match(edge, /reviewRequired: true/);
  assert.doesNotMatch(edge, /media_status: "published"|status: "published"/);
});

test("Factory exposes Gemini image generation, confirms cost, and links the asset for review", () => {
  assert.match(panel, /label: "Gemini Image", available: !isVideo/);
  assert.match(panel, /window\.confirm\(language === "ar"/);
  assert.match(panel, /generateGeminiImageForContentItem\(session, item\)/);
  assert.match(panel, /await linkMediaToItem\(item\.id, generated\.mediaAssetId\)/);
  assert.match(panel, /return designCapabilityState !== "NOT_CONFIGURED" \? "canva" : "gemini"/);
});
