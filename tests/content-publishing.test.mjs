import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORIZED_FACEBOOK_PUBLISH_ITEM_ID,
  INSTAGRAM_ACCOUNT_ID,
  buildExternalPostLink,
  buildFacebookPublishAudit,
  buildTrackedCta,
  buildWhatsAppLeadUrl,
  hashtagsForPlatform,
  normalizeFacebookPostId,
  resolvePublishPipelineStage,
  summarizeLivePublishingReadiness,
} from "../src/content-publishing.ts";

test("Instagram account ID matches the official Relax Fix Meta asset", () => {
  assert.equal(INSTAGRAM_ACCOUNT_ID, "17841400516801494");
});

test("video pipeline keeps facebook primary path without openai fallback", () => {
  const stage = resolvePublishPipelineStage({
    id: "11111111-1111-4111-8111-111111111111",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    platform: "facebook",
    contentType: "post",
    caption: "test",
    topic: "test",
    scheduledFor: null,
  });
  assert.equal(stage, "approved_ready");
});

test("published receipt resolves to published_live", () => {
  const stage = resolvePublishPipelineStage({
    id: "22222222-2222-4222-8222-222222222222",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    platform: "facebook",
    contentType: "post",
    caption: "test",
    topic: "test",
    scheduledFor: null,
    receipts: [{ platform: "facebook", status: "published", externalPostId: "1234567890", updatedAt: "2026-01-02T00:00:00.000Z" }],
  });
  assert.equal(stage, "published_live");
  assert.equal(buildExternalPostLink("facebook", "1234567890"), "https://www.facebook.com/1164107840123575/posts/1234567890");
});

test("facebook post links normalize pageId_postId receipts", () => {
  assert.equal(normalizeFacebookPostId("1164107840123575_122116295205382830"), "122116295205382830");
  assert.equal(
    buildExternalPostLink("facebook", "1164107840123575_122116295205382830"),
    "https://www.facebook.com/1164107840123575/posts/122116295205382830",
  );
});

test("readiness prioritizes authorized facebook publish item", () => {
  const readiness = summarizeLivePublishingReadiness([
    {
      id: AUTHORIZED_FACEBOOK_PUBLISH_ITEM_ID,
      status: "approved",
      createdAt: "2026-01-01T00:00:00.000Z",
      platform: "facebook",
      contentType: "post",
      caption: "authorized",
      topic: "authorized facebook test",
      scheduledFor: null,
    },
  ], "facebook");
  assert.equal(readiness.nextAction, "publish_via_n8n");
  assert.equal(readiness.authorizedItem?.topic, "authorized facebook test");
});

test("instagram readiness asks for batch generation when nothing is reviewable", () => {
  const readiness = summarizeLivePublishingReadiness([
    {
      id: "33333333-3333-4333-8333-333333333333",
      status: "cancelled",
      createdAt: "2026-01-01T00:00:00.000Z",
      platform: "instagram",
      contentType: "post",
      caption: "old",
      topic: "old instagram item",
      scheduledFor: null,
    },
  ], "instagram");
  assert.equal(readiness.nextAction, "continue_batch");
  assert.equal(readiness.approvedCount, 0);
});

test("instagram readiness moves to n8n after approval", () => {
  const readiness = summarizeLivePublishingReadiness([
    {
      id: "44444444-4444-4444-8444-444444444444",
      status: "approved",
      createdAt: "2026-01-01T00:00:00.000Z",
      platform: "instagram",
      contentType: "post",
      caption: "ready",
      topic: "instagram test post",
      scheduledFor: null,
    },
  ], "instagram");
  assert.equal(readiness.nextAction, "publish_via_n8n");
  assert.equal(readiness.approvedCount, 1);
});

test("facebook audit flags manual public verification when receipt is published", () => {
  const audit = buildFacebookPublishAudit([
    {
      id: AUTHORIZED_FACEBOOK_PUBLISH_ITEM_ID,
      status: "published",
      createdAt: "2026-01-01T00:00:00.000Z",
      platform: "facebook",
      contentType: "post",
      caption: "authorized",
      topic: "authorized facebook test",
      scheduledFor: null,
      publishedAt: "2026-08-05T21:57:29.690Z",
      receipts: [{
        platform: "facebook",
        status: "published",
        externalPostId: "1164107840123575_122116295205382830",
        updatedAt: "2026-08-05T21:57:29.690Z",
      }],
    },
  ]);
  assert.ok(audit);
  assert.equal(audit.needsManualPublicCheck, true);
  assert.match(audit.postUrl ?? "", /122116295205382830/);
});

test("tracked cta includes whatsapp attribution without secrets", () => {
  const cta = buildTrackedCta("instagram", "swimming_education");
  assert.match(cta, /WhatsApp 058 821 9130 — messages & booking/);
  assert.match(cta, /Call 055 137 8660 — admin team \(phone calls only\)/);
  assert.match(cta, /wa\.me\/971588219130/);
  assert.match(buildWhatsAppLeadUrl({ platform: "facebook", pillar: "conversion" }), /utm_source=facebook/);
  assert.match(buildWhatsAppLeadUrl({ platform: "facebook" }), /Relax\+Fix\+UAE/);
  assert.doesNotMatch(cta, /OPENAI|sk-/i);
});

test("hashtags follow Relax Fix UAE platform rules", () => {
  assert.deepEqual(hashtagsForPlatform("facebook"), ["#RelaxFixUAE"]);
  assert.deepEqual(hashtagsForPlatform("tiktok"), ["#RelaxFixUAE", "#AbuDhabiSwimming", "#SwimTok"]);
  assert.equal(hashtagsForPlatform("instagram", "reel")[0], "#RelaxFixUAE");
});
