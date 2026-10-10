import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../src/gemini-batch-adapter.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/generate-content-batch/index.ts", import.meta.url), "utf8");
const slotSpec = await readFile(new URL("../supabase/functions/generate-content-batch/coach-ayman-slot-spec.ts", import.meta.url), "utf8");
const generator = await readFile(new URL("../src/content-batch-generator.ts", import.meta.url), "utf8");
const hub = await readFile(new URL("../src/content-growth-hub.tsx", import.meta.url), "utf8");
const coachBrain = await readFile(new URL("../src/coach-brain.tsx", import.meta.url), "utf8");

test("gemini batch adapter calls server edge function only", () => {
  assert.match(adapter, /functions\/v1\/generate-content-batch/);
  assert.match(adapter, /generateCoachAymanBatchWithGemini/);
  assert.match(adapter, /generateCoachAymanBatchWithProvider/);
  assert.match(adapter, /BatchAiProvider/);
  assert.doesNotMatch(adapter, /GEMINI_API_KEY|VITE_GEMINI/i);
});

test("generate-content-batch edge function keeps Gemini key server-side", () => {
  assert.match(edge, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /api\.openai\.com\/v1\/responses/);
  assert.match(edge, /requestedProvider/);
  assert.match(edge, /body\.mode !== "generate" && body\.mode !== "sample"/);
  assert.match(edge, /Relax Fix UAE Swimming Academy/);
  assert.match(edge, /coach-ayman-slot-spec\.ts/);
  assert.match(edge, /captionBody/);
  assert.match(edge, /ensureMediaBrief/);
});

test("gemini slot spec aligns with local batch strategy mix", () => {
  assert.match(slotSpec, /COACH_AYMAN_SLOT_SPEC/);
  assert.match(slotSpec, /contentType: "reel"/);
  assert.match(slotSpec, /contentType: "carousel"/);
  assert.match(slotSpec, /contentType: "post"/);
  assert.match(slotSpec, /strategyLabel: "Short Reel — common swimming problem"/);
  assert.match(slotSpec, /strategyLabel: "Trust \+ Conversion"/);
  assert.match(slotSpec, /buildVideoBrief/);
  assert.match(slotSpec, /VIDEO BRIEF:/);
  assert.match(slotSpec, /primaryCtaKey: "book"/);
  assert.match(slotSpec, /FORMAT:/);
  assert.match(slotSpec, /CANVA:/);
  assert.match(slotSpec, /CAPCUT:/);
  assert.match(slotSpec, /RUNWAY \(optional\)/);
  assert.match(generator, /contentType: "reel"/);
  assert.match(generator, /buildVideoBrief/);
  assert.match(generator, /primaryCta: PRIMARY_CTAS\.book/);
  assert.doesNotMatch(slotSpec, /platform: "tiktok"/);
});

test("content growth hub generates 30-day local calendar with media linkage", () => {
  assert.match(hub, /buildCoachAyman30DayBatchWithMedia/);
  assert.match(hub, /create_staff_generated_content_batch/);
  assert.match(hub, /batchAiProvider/);
  assert.match(hub, /Auto — best available/);
});

test("existing Coach Brain, Academy, business and performance context reaches the Gemini prompt", () => {
  assert.match(coachBrain, /answer: result\?\.answer\?\.slice\(0, 4000\)/);
  assert.match(hub, /academyKnowledge: knowledgeContext\.entries/);
  assert.match(hub, /coachBrainResearch: knowledgeContext\.researchContext \?\? null/);
  assert.match(hub, /businessStrategy: \{ brand: BRAND, platformGuidance: PLATFORM_GUIDANCE, strategySummary: \{ \.\.\.strategySummary, currentBatchStrategy: planFocus \} \}/);
  assert.match(hub, /performanceGuidance: insights/);
  assert.match(adapter, /promptContext: promptContext \?\? null/);
  assert.match(edge, /sanitizePromptContext\(body\.promptContext\)/);
  assert.match(edge, /CANONICAL ACADEMY KNOWLEDGE/);
  assert.match(edge, /COACH BRAIN RESEARCH/);
  assert.match(edge, /CANONICAL BUSINESS FACTS AND PLATFORM STRATEGY/);
  assert.match(edge, /EXISTING FACTORY STRATEGY SUMMARY/);
  assert.match(edge, /PERFORMANCE GUIDANCE/);
});

test("Gemini creative output cannot override main slots, CTAs, security checks or media fallback", () => {
  assert.match(hub, /generated\.contentType === canonical\.contentType/);
  assert.match(hub, /generated\.contentPillar === canonical\.contentPillar/);
  assert.match(hub, /generated\.contentSlot === canonical\.contentSlot/);
  assert.match(hub, /generated\.cta === canonical\.cta/);
  assert.match(hub, /validateCoachAymanBatch\(merged\)\.valid/);
  assert.match(hub, /mergeValidatedGeminiCreativeFields\(\s*geminiItems,\s*windowedCanonicalItems,\s*batchNonce,?\s*\)\s*\?\?\s*windowedCanonicalItems/);
  assert.match(edge, /context may influence only topic, hook, captionBody, and visualPrompt/i);
});

test("Factory lets the owner choose a scheduling window without creating a second system", () => {
  assert.match(hub, /PLAN_WINDOW_OPTIONS/);
  assert.match(hub, /planWindowDays/);
  assert.match(hub, /fitBatchToPlanWindow/);
  assert.match(hub, /COACH BRAIN PLAN/);
  assert.match(hub, /DEFAULT_BATCH_MIX\.length/);
  assert.match(hub, /7, 14, 30/);
});


test("Coach Brain can generate one real non-persisted sample and carry the owner plan", () => {
  assert.match(adapter, /generateCoachAymanSampleWithProvider/);
  assert.match(adapter, /mode: "sample"/);
  assert.match(edge, /body\.mode === "sample"/);
  assert.match(edge, /sampleSlot/);
  assert.match(edge, /expectedCount/);
  assert.match(coachBrain, /Show a real sample|شاهد عينة حقيقية/);
  assert.match(coachBrain, /planWindowDays/);
  assert.match(coachBrain, /planExecution/);
  assert.match(hub, /planDays/);
  assert.match(hub, /planFocus/);
  assert.match(hub, /get_staff_integrations/);
  assert.match(hub, /canvaIntegration/);
});
