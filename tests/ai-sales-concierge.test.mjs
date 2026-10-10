import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { APPROVED_PRICING, buildSalesConciergeTurn, detectLanguage } from "../src/ai-sales-concierge/logic.mjs";

const migration = await readFile(new URL("../supabase/migrations/20260811103000_ai_sales_concierge_phase6a.sql", import.meta.url), "utf8");

function turn(messageBody, overrides = {}) {
  return buildSalesConciergeTurn({
    channel: "whatsapp",
    mode: "ai_active",
    messageBody,
    intent: null,
    service: null,
    stage: "new",
    score: 0,
    fearOfWater: null,
    humanRequired: false,
    recentMessages: [],
    questionLedger: { questions_asked: [], questions_answered: [], known_facts: {} },
    knownFacts: {},
    ...overrides,
  });
}

test("migration defines unified concierge RPC without outbound send", () => {
  assert.match(migration, /process_ai_sales_concierge_turn/);
  assert.match(migration, /author_type,\s*body,\s*safety_classification/);
  assert.match(migration, /'ai_draft'/);
  assert.match(migration, /outboundEnabled',\s*false/);
  assert.match(migration, /150 AED instead of 200 AED/);
  assert.match(migration, /450 AED/);
  assert.match(migration, /400 AED instead of 450 AED/);
  assert.doesNotMatch(migration, /send.*whatsapp/i);
});

test("language detection supports Arabic and English", () => {
  assert.equal(detectLanguage("Hello, how much is a private lesson?"), "en");
  assert.equal(detectLanguage("مرحبا، كم سعر الحصة الخاصة؟"), "ar");
});

test("pricing guardrails stay within approved commercial facts", () => {
  const en = turn("How much does it cost?");
  assert.match(en.draftReply, /150 AED instead of 200 AED/);
  assert.match(en.draftReply, /450 AED/);
  assert.match(en.draftReply, /400 AED instead of 450 AED/);
  assert.doesNotMatch(en.draftReply, /300 AED|500 AED|guarantee|available tomorrow/i);

  const ar = turn("كم السعر؟");
  assert.match(ar.draftReply, /150 درهم بدل 200 درهم/);
  assert.match(ar.draftReply, /450 درهم/);
  assert.match(ar.draftReply, /400 درهم بدل 450 درهم/);
});

test("qualification asks short offer-type question before pricing", () => {
  const result = turn("Hi");
  assert.equal(result.nextIntent, "concierge:awaiting_offer_type");
  assert.match(result.draftReply, /private swimming lesson or a group lesson/i);
});

test("human handoff routes to human review without auto apology draft", () => {
  const result = turn("I want to speak to Coach Ayman");
  assert.equal(result.humanHandoff, true);
  assert.equal(result.draftReply, null);
  assert.equal(result.outboundEnabled, false);
});

test("booking guidance advances lead stage intent", () => {
  const priced = turn("private lesson", { intent: "concierge:presented_pricing", service: "private", stage: "qualified" });
  const booking = turn("I want to book", {
    intent: priced.nextIntent,
    service: priced.nextService,
    stage: priced.nextStage,
    score: priced.nextScore,
  });
  assert.equal(booking.nextStage, "booking_intent");
  assert.match(booking.draftReply, /Coach Ayman/i);
});

test("approved pricing constants are frozen", () => {
  assert.equal(APPROVED_PRICING.private.en.includes("150 AED"), true);
  assert.equal(APPROVED_PRICING.group.en.includes("450 AED"), true);
  assert.equal(APPROVED_PRICING.siblings.en.includes("400 AED"), true);
});

test("non-ai-active conversations are skipped safely", () => {
  const result = turn("Hello", { mode: "human_takeover" });
  assert.equal(result.skipped, true);
  assert.equal(result.draftReply, null);
});
