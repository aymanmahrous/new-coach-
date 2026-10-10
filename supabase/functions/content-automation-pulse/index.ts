import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  COACH_AYMAN_BATCH_SIZE,
  COACH_AYMAN_PROVIDER_ID,
  COACH_AYMAN_SLOT_SPEC,
  FORBIDDEN_CLAIMS,
  PRIMARY_CTAS,
  buildBatchTrackedCta,
  buildHashtags,
  buildTemplateBatchItems,
  contentFingerprint,
  ensureMediaBrief,
  ensureRelaxFixBrandLead,
  gstSlotUtc,
  primaryCtaForSlot,
} from "../generate-content-batch/coach-ayman-slot-spec.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const CONTENT_PUBLISHER_AUTOMATION_SECRET = Deno.env.get("CONTENT_PUBLISHER_AUTOMATION_SECRET") ?? "";
const SAFE_PUBLISHER_TIMEOUT_MS = 45_000;
const SAFE_PUBLISHER_URL = `${SUPABASE_URL}/functions/v1/safe-content-publisher`;
const GEMINI_MODEL = "gemini-2.0-flash";
const LEASE_NAME = "content_automation_pulse";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-relax-fix-scheduler",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

type JsonObject = Record<string, unknown>;

function json(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function buildPrompt(batchNonce: string, startIso: string) {
  const slotInstructions = COACH_AYMAN_SLOT_SPEC.map((slot, index) => ({
    index,
    platform: slot.platform,
    contentType: slot.contentType,
    contentPillar: slot.contentPillar,
    contentSlot: slot.contentSlot,
    funnel: slot.funnel,
    topicSeed: slot.topicSeed,
    hookSeed: slot.hookSeed,
    primaryCta: PRIMARY_CTAS[slot.primaryCtaKey],
    topicHashtags: slot.topicHashtags,
    arabicHint: slot.arabicHint ?? null,
    briefFormat: slot.briefFormat,
  }));

  return [
    "You generate a 10-item English social content batch for Relax Fix UAE Swimming Academy — Coach Ayman.",
    "Return strict JSON only: { \"items\": [ ... ] } with exactly 10 objects.",
    "Each item keys: topic, hook, captionBody, visualPrompt.",
    JSON.stringify(slotInstructions, null, 2),
    `Batch nonce for uniqueness: ${batchNonce}. Start date ISO: ${startIso}.`,
  ].join("\n");
}

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) return null;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as JsonObject | null;
  const parts = ((payload?.candidates as JsonObject[] | undefined)?.[0]?.content as JsonObject | undefined)?.parts as JsonObject[] | undefined;
  const text = parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return null;
  }
}

function stripTrackedFooter(caption: string): string {
  return caption
    .replace(/\n*Relax Fix UAE Swimming Academy\nWhatsApp 058 821 9130 — messages & booking[\s\S]*$/i, "")
    .trim();
}

async function normalizeGeminiItems(rawItems: unknown[], batchNonce: string, start: Date) {
  const items = [];
  for (let index = 0; index < COACH_AYMAN_SLOT_SPEC.length; index += 1) {
    const slot = COACH_AYMAN_SLOT_SPEC[index];
    const raw = (rawItems[index] ?? {}) as JsonObject;
    const primaryCta = primaryCtaForSlot(slot);
    const trackedCta = buildBatchTrackedCta(slot.platform, slot.contentPillar);
    const topic = String(raw.topic ?? slot.topicSeed).trim() || slot.topicSeed;
    const hook = String(raw.hook ?? slot.hookSeed).trim() || slot.hookSeed;
    const rawBody = String(raw.captionBody ?? raw.caption ?? "").trim();
    const body = stripTrackedFooter(rawBody) || slot.topicSeed;
    const brandedBody = ensureRelaxFixBrandLead(body);
    const captionBody = brandedBody.includes(primaryCta) ? brandedBody : `${brandedBody}\n\n${primaryCta}`;
    const caption = `${captionBody}\n\n${trackedCta}`;
    const visualPrompt = ensureMediaBrief(String(raw.visualPrompt ?? "").trim(), slot, primaryCta);
    const fingerprintSeed = `${COACH_AYMAN_PROVIDER_ID}:${batchNonce}:${index}:${slot.platform}:${topic}`;
    if (FORBIDDEN_CLAIMS.test(`${topic} ${hook} ${caption}`)) {
      throw new Error(`FORBIDDEN_CLAIM_LANGUAGE_AT_${index}`);
    }
    items.push({
      platform: slot.platform,
      contentType: slot.contentType,
      language: "en",
      contentPillar: slot.contentPillar,
      contentSlot: slot.contentSlot,
      plannedFor: gstSlotUtc(slot.dayOffset, slot.hourGst, start),
      topic,
      hook,
      caption,
      cta: trackedCta,
      hashtags: buildHashtags(slot.platform, slot.topicHashtags),
      visualPrompt,
      contentFingerprint: await contentFingerprint(fingerprintSeed),
    });
  }
  return items;
}

async function buildBatchItems(batchNonce: string, start: Date) {
  const geminiPayload = await callGemini(buildPrompt(batchNonce, start.toISOString()));
  const rawItems = Array.isArray(geminiPayload?.items) ? geminiPayload.items : [];
  if (rawItems.length === COACH_AYMAN_BATCH_SIZE) {
    try {
      return { items: await normalizeGeminiItems(rawItems, batchNonce, start), provider: "gemini" };
    } catch {
      // fall through to template
    }
  }
  return { items: await buildTemplateBatchItems(batchNonce, start), provider: "template" };
}

type PublishJobContent = {
  contentItemId: string;
  platform: string;
};

async function processOnePublishJob(supabase: ReturnType<typeof createClient>) {
  const claimed = await supabase.rpc("claim_next_publish_job");
  if (claimed.error) throw claimed.error;
  if (!claimed.data?.claimed) return { attempts: 0, processed: 0, outcome: claimed.data ?? { code: "NO_JOB" } };

  const jobId = String(claimed.data.jobId ?? "");
  const content = claimed.data.content as PublishJobContent | undefined;
  const contentItemId = String(content?.contentItemId ?? "");
  const platform = String(content?.platform ?? "").toLowerCase();
  if (!jobId || !contentItemId || !["facebook", "instagram"].includes(platform)) {
    return { attempts: 1, processed: 0, outcome: { code: "CLAIM_PAYLOAD_INVALID", jobId, contentItemId, platform } };
  }

  if (!CONTENT_PUBLISHER_AUTOMATION_SECRET) {
    return { attempts: 1, processed: 0, outcome: { code: "PUBLISHER_AUTOMATION_SECRET_MISSING", jobId, ambiguous: true } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SAFE_PUBLISHER_TIMEOUT_MS);
  let response: Response;
  let body: Record<string, unknown> = {};
  try {
    response = await fetch(SAFE_PUBLISHER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-content-publisher-automation-secret": CONTENT_PUBLISHER_AUTOMATION_SECRET,
      },
      body: JSON.stringify({ jobId, contentItemId, platform }),
      signal: controller.signal,
    });
    body = await response.json().catch(() => ({})) as Record<string, unknown>;
  } catch (cause) {
    return { attempts: 1, processed: 0, outcome: { code: "AMBIGUOUS_RESULT", jobId, ambiguous: true, detail: cause instanceof Error ? cause.name : "NETWORK_ERROR" } };
  } finally {
    clearTimeout(timeout);
  }

  if (body.success === true && typeof body.providerExternalId === "string" && body.providerExternalId.trim()) {
    const completed = await supabase.rpc("complete_publish_job", {
      p_job_id: jobId,
      p_provider_external_id: body.providerExternalId.trim(),
      p_published_at: new Date().toISOString(),
    });
    if (completed.error || !completed.data?.success) {
      return { attempts: 1, processed: 0, outcome: { code: "COMPLETE_FAILED", jobId, ambiguous: true, detail: completed.error?.message ?? completed.data } };
    }
    return { attempts: 1, processed: 1, outcome: { code: "PUBLISH_COMPLETED", jobId, providerExternalId: body.providerExternalId } };
  }

  if (body.ambiguous === true || body.code === "AMBIGUOUS_RESULT" || response.status === 504) {
    return { attempts: 1, processed: 0, outcome: { code: "AMBIGUOUS_RESULT", jobId, ambiguous: true } };
  }

  if (body.confirmed === true || body.success === false) {
    const failed = await supabase.rpc("fail_publish_job", {
      p_job_id: jobId,
      p_error: String(body.code ?? "PUBLISH_FAILED"),
    });
    if (failed.error || !failed.data?.success) {
      return { attempts: 1, processed: 0, outcome: { code: "FAIL_RECORD_FAILED", jobId, ambiguous: true, detail: failed.error?.message ?? failed.data } };
    }
    return { attempts: 1, processed: 0, outcome: { code: "PUBLISH_FAILED", jobId, failure: body.code ?? "PUBLISH_FAILED" } };
  }

  return { attempts: 1, processed: 0, outcome: { code: "AMBIGUOUS_RESULT", jobId, ambiguous: true } };
}

async function processOneMediaJob(supabase: ReturnType<typeof createClient>) {
  const claimed = await supabase.rpc("claim_next_content_media_job");
  if (claimed.error) throw claimed.error;
  if (!claimed.data?.claimed) return { attempts: 0, processed: 0, outcome: claimed.data ?? { code: "NO_MEDIA_JOB" } };

  const jobId = String(claimed.data.jobId ?? "");
  const contentItemId = String(claimed.data.contentItemId ?? "");
  if (!jobId || !contentItemId) {
    return { attempts: 1, processed: 0, outcome: { code: "MEDIA_CLAIM_PAYLOAD_INVALID", jobId, contentItemId } };
  }

  const { data: item, error: itemError } = await supabase
    .from("content_items")
    .select("topic,hook,caption,content_type")
    .eq("id", contentItemId)
    .maybeSingle();
  if (itemError || !item) {
    await supabase.rpc("fail_content_media_job", { p_job_id: jobId, p_error: "CONTENT_ITEM_READ_FAILED" });
    return { attempts: 1, processed: 0, outcome: { code: "CONTENT_ITEM_READ_FAILED", jobId } };
  }

  if (!CONTENT_PUBLISHER_AUTOMATION_SECRET) {
    return { attempts: 1, processed: 0, outcome: { code: "PUBLISHER_AUTOMATION_SECRET_MISSING", jobId, ambiguous: true } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/canva-design`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-content-publisher-automation-secret": CONTENT_PUBLISHER_AUTOMATION_SECRET,
      },
      body: JSON.stringify({
        mode: "generate",
        contentItemId,
        topic: String(item.topic ?? ""),
        hook: String(item.hook ?? ""),
        caption: String(item.caption ?? ""),
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (body.success === true && typeof body.mediaAssetId === "string") {
      const completed = await supabase.rpc("complete_content_media_job", {
        p_job_id: jobId,
        p_storage_path: String(body.storagePath ?? ""),
        p_provider: "canva",
        p_provider_job_id: String(body.mediaAssetId),
        p_metadata: { mediaAssetId: body.mediaAssetId, automated: true },
      });
      if (completed.error || !completed.data?.success) {
        return { attempts: 1, processed: 0, outcome: { code: "MEDIA_COMPLETE_FAILED", jobId, ambiguous: true } };
      }
      return { attempts: 1, processed: 1, outcome: { code: "MEDIA_COMPLETED", jobId, mediaAssetId: body.mediaAssetId } };
    }

    const confirmed = response.status >= 400 && response.status < 500 && body.code !== "CANVA_TOKEN_REFRESH_FAILED";
    if (confirmed) {
      const failed = await supabase.rpc("fail_content_media_job", { p_job_id: jobId, p_error: String(body.code ?? "MEDIA_GENERATION_FAILED") });
      return { attempts: 1, processed: 0, outcome: { code: failed.error ? "MEDIA_FAIL_RECORD_FAILED" : "MEDIA_FAILED", jobId, failure: body.code ?? "MEDIA_GENERATION_FAILED" } };
    }

    await supabase.rpc("defer_content_media_job", { p_job_id: jobId, p_reason: String(body.code ?? "MEDIA_RETRY"), p_delay_seconds: 1800 });
    return { attempts: 1, processed: 0, outcome: { code: "MEDIA_DEFERRED", jobId, reason: body.code ?? "MEDIA_RETRY" } };
  } catch (cause) {
    await supabase.rpc("defer_content_media_job", { p_job_id: jobId, p_reason: cause instanceof Error ? cause.name : "NETWORK_ERROR", p_delay_seconds: 1800 });
    return { attempts: 1, processed: 0, outcome: { code: "MEDIA_DEFERRED", jobId, ambiguous: true } };
  } finally {
    clearTimeout(timeout);
  }
}

async function saveBatchWithShift(
  supabase: ReturnType<typeof createClient>,
  items: JsonObject[],
  cycleKey: string,
) {
  for (let shiftDays = 0; shiftDays <= 14; shiftDays += 1) {
    const shifted = shiftDays === 0
      ? items
      : items.map((item) => {
        const planned = new Date(String(item.plannedFor));
        planned.setUTCDate(planned.getUTCDate() + shiftDays);
        return { ...item, plannedFor: planned.toISOString() };
      });
    const { data, error } = await supabase.rpc("create_automated_content_batch", {
      p_items: shifted,
      p_provider_external_id: COACH_AYMAN_PROVIDER_ID,
      p_cycle_key: cycleKey,
    });
    if (error) {
      if (error.message.includes("CONTENT_SLOT_ALREADY_PLANNED")) continue;
      throw error;
    }
    return data as JsonObject;
  }
  throw new Error("CONTENT_SLOT_ALREADY_PLANNED");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ success: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ success: false, code: "SERVER_MISCONFIGURED" }, 500);
  }

  const token = bearerToken(request);
  if (!token) return json({ success: false, code: "AUTH_REQUIRED" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const verify = await supabase.rpc("verify_content_automation_scheduler_token", { p_token: token });
  if (verify.error || !verify.data?.valid) {
    return json({ success: false, code: verify.data?.code ?? "SCHEDULER_TOKEN_INVALID" }, 401);
  }

  const lease = await supabase.rpc("claim_content_automation_lease", {
    p_lease_name: LEASE_NAME,
    p_lease_seconds: 240,
  });
  if (lease.error) return json({ success: false, code: "LEASE_ERROR", detail: lease.error.message }, 500);
  if (!lease.data?.claimed) {
    return json({ success: true, code: "LEASE_HELD", skipped: true, detail: lease.data });
  }

  const leaseToken = String(lease.data.leaseToken);
  const run = await supabase.rpc("start_content_automation_run", { p_source: "supabase_cron" });
  if (run.error || !run.data?.runId) {
    await supabase.rpc("release_content_automation_lease", { p_lease_name: LEASE_NAME, p_lease_token: leaseToken });
    return json({ success: false, code: "RUN_START_FAILED", detail: run.error?.message }, 500);
  }

  const runId = String(run.data.runId);
  let summary: JsonObject = {
    contentBrainGenerationTriggered: false,
    humanApprovalRequired: true,
    publishing: [],
    media: [],
  };

  try {
    const evaluation = await supabase.rpc("evaluate_content_batch_generation_need");
    if (evaluation.error) throw evaluation.error;
    summary = { ...summary, generation: evaluation.data };

    if (evaluation.data?.shouldGenerate) {
      const cycleKey = String(evaluation.data.cycleKey);
      const startIso = typeof evaluation.data.suggestedStartIso === "string"
        ? evaluation.data.suggestedStartIso
        : new Date().toISOString();
      const batchNonce = `${cycleKey}:${crypto.randomUUID()}`;
      const built = await buildBatchItems(batchNonce, new Date(startIso));
      const saved = await saveBatchWithShift(supabase, built.items, cycleKey);
      summary = {
        ...summary,
        contentBrainGenerationTriggered: true,
        generationProvider: built.provider,
        batchId: saved.batchId,
        generationCode: saved.code,
      };
    }

    const media = await processOneMediaJob(supabase);
    summary = { ...summary, media: [media.outcome] };

    const publishing = await processOnePublishJob(supabase);
    summary = { ...summary, publishing: [publishing.outcome] };

    await supabase.rpc("complete_content_automation_run", {
      p_run_id: runId,
      p_status: "completed",
      p_media_attempts: media.attempts,
      p_media_processed: media.processed,
      p_publish_attempts: publishing.attempts,
      p_publish_processed: publishing.processed,
      p_summary: summary,
    });

    await supabase.rpc("release_content_automation_lease", {
      p_lease_name: LEASE_NAME,
      p_lease_token: leaseToken,
    });

    return json({ success: true, runId, summary });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "CONTENT_AUTOMATION_PULSE_FAILED";
    await supabase.rpc("fail_content_automation_run", {
      p_run_id: runId,
      p_error: message,
      p_summary: summary,
    });
    await supabase.rpc("release_content_automation_lease", {
      p_lease_name: LEASE_NAME,
      p_lease_token: leaseToken,
    });
    return json({ success: false, code: "PULSE_FAILED", error: message, runId }, 500);
  }
});
