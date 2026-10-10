import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiUsageSummary } from "../supabase/functions/coach-brain-research/usage.ts";

const request = {
  requestedModel: "gemini-3.7-flash",
  modelVersion: "gemini-3.7-flash-20260813",
  metadata: {
    promptTokenCount: 1000,
    candidatesTokenCount: 500,
    thoughtsTokenCount: 100,
    totalTokenCount: 1600,
    toolUsePromptTokenCount: 120,
  },
  webSearchQueries: [" swim turns ", "", "swim turns", "turn drills"],
};

test("calculates a paid-tier token estimate from provider usage and deduplicates actual search queries", () => {
  const usage = buildGeminiUsageSummary({ ...request, now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 500);
  assert.equal(usage.thinkingTokens, 100);
  assert.equal(usage.totalTokens, 1600);
  assert.equal(usage.toolUsePromptTokens, 120);
  assert.equal(usage.groundingSearchQueries, 2);
  assert.equal(usage.estimatedTokenCostUsd, 0.003);
  assert.equal(usage.pricingEffectiveThrough, "2026-12-31");
  assert.equal(usage.groundingFeeIncluded, false);
  assert.equal(usage.groundingQuotaStatus, "unknown");
});

test("uses the published scheduled rate starting January 2027", () => {
  const usage = buildGeminiUsageSummary({ ...request, now: new Date("2027-01-01T00:00:00Z") });
  assert.equal(usage.estimatedTokenCostUsd, 0.006);
  assert.equal(usage.pricingEffectiveFrom, "2027-01-01");
  assert.equal(usage.pricingEffectiveThrough, null);
});

test("does not report a zero cost when billable usage metadata is missing or malformed", () => {
  const missing = buildGeminiUsageSummary({ requestedModel: "gemini-3.7-flash", metadata: { promptTokenCount: 0, candidatesTokenCount: 0 }, now: new Date("2026-10-01T00:00:00Z") });
  const malformed = buildGeminiUsageSummary({ requestedModel: "gemini-3.7-flash", metadata: { promptTokenCount: -1, candidatesTokenCount: 10, thoughtsTokenCount: 0 }, now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(missing.estimatedTokenCostUsd, null);
  assert.equal(missing.pricingStatus, "unavailable");
  assert.equal(malformed.inputTokens, null);
  assert.equal(malformed.estimatedTokenCostUsd, null);
});

test("does not estimate unknown models or assume an unknown grounding quota is free", () => {
  const usage = buildGeminiUsageSummary({ ...request, requestedModel: "unlisted-model", now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(usage.estimatedTokenCostUsd, null);
  assert.equal(usage.pricingStatus, "unavailable");
  assert.equal(usage.groundingQuotaStatus, "unknown");
});
